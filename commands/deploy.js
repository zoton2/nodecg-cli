'use strict';

// Native
const fs = require('fs');

// Packages
const bitbucketjs = require('bitbucketjs');
const clone = require('clone');
const DigitalOcean = require('do-wrapper');
const GitHubApi = require('github');
const hostedGitInfo = require('hosted-git-info');
const request = require('request-promise');
const semver = require('semver');
const NodeSSH = require('node-ssh');
const generatePassword = require('password-generator');

// Ours
const CloudConfig = require('../lib/cloud-config');
const cfg = require('../lib/cfg');
const getPublicKey = require('../lib/get-public-key');
const getBitBucketCredentials = require('../lib/get-bitbucket-credentials');
const getGitHubCredentials = require('../lib/get-github-credentials');
const getNodecgTarballUrl = require('../lib/get-nodecg-tarball-url');

const ssh = new NodeSSH();
const config = cfg.read();
const github = new GitHubApi();
const unauthenticatedBitbucket = bitbucketjs();
const sshPassword = generatePassword(32, false);
const DROPLET_USERNAME = 'nodecg-user';
const NODECG_DIR = `/home/${DROPLET_USERNAME}/nodecg`;
const BUNDLES_DIR = `${NODECG_DIR}/bundles`;

module.exports = function (program) {
	program
		.command('deploy <filePath>')
		.description('Deploys the given NodeCG instance to DigitalOcean')
		.action(action);
};

function action(filePath) {
	const file = fs.readFileSync(filePath);
	const deploymentDefinition = JSON.parse(file);
	deploymentDefinition.bundles = parseBundles(deploymentDefinition);
	const digitalOceanApi = new DigitalOcean('[api_key]');
	let credentials;

	gatherNeededCredentials(deploymentDefinition).then(creds => {
		credentials = creds;
		return gatherDownloadUrls(deploymentDefinition, credentials);
	}).then(deploymentDefinitionWithDownloadUrls => {
		return generateCloudConfig(deploymentDefinitionWithDownloadUrls, credentials);
	}).then(cloudConfig => {
		console.log(JSON.stringify(cloudConfig.json, null, 2));
		console.log('\n\n');
		console.log(cloudConfig.dump());

		// TODO: Have a timeout for this
		// TODO: handle errors here
		return new Promise(resolve => {
			ssh.connect({
				host: 'localhost',
				username: 'nodecg-user',
				password: sshPassword
			}).then(() => {
				// Check every 2.5s
				const interval = setInterval(() => {
					isBootFinished(ssh).then(isFinished => {
						if (isFinished) {
							clearInterval(interval);
							resolve();
						}
					});
				}, 2500);
			});
		}).then(() => {
			// Completely disable PasswordAuthentication, now that we're done with it.
			// The user is expected to always login via publickey auth.
			return new Promise((resolve, reject) => {
				ssh.execCommand(
					`sed -i -e '/^PasswordAuthentication/s/^.*$/PasswordAuthentication no/' /etc/ssh/sshd_config`
				).then(result => {
					if (result.stderr) {
						reject(result.stderr);
					} else {
						resolve(result.stdout);
					}
				});
			});
		});

		/*
		1. Make the Block Storage volume if it doesn't yet exist.
		2. Make the droplet with name "${name}-staging", but don't attach the volume yet. It will mostly auto-provision thanks to the cloud-init script.
		3. Wait for the droplet to finish being provisioned. (Don't yet have a good way of signaling when this has happened)
		4. Assign the Floating IP to the new droplet, and attach the Block Storage volume to it.
		5. Run a small script that makes a new LE cert *only if* there isn't one already on the volume.
		6.
		 */
	}).catch(error => {
		console.error(error);
	});
}

function isBootFinished(ssh) {
	return new Promise((resolve, reject) => {
		ssh.execCommand(
			'[ -f /var/lib/cloud/data/result.json ] && cat /var/lib/cloud/data/result.json || echo "Not found"'
		).then(result => {
			if (result.stdout === 'Not found') {
				resolve(false);
			} else if (result.stdout) {
				const resultJson = JSON.parse(result.stdout);
				if (resultJson.errors && resultJson.errors.length > 0) {
					reject(resultJson.errors);
				} else {
					resolve();
				}
			}

			reject(result.stderr);
		});
	});
}

function parseBundles(deploymentDefinition) {
	const bundles = [];
	for (const bundleName in deploymentDefinition.bundles) {
		if (!{}.hasOwnProperty.call(deploymentDefinition.bundles, bundleName)) {
			continue;
		}

		const bundle = deploymentDefinition.bundles[bundleName];
		bundle.name = bundleName;
		bundle.hostedGitInfo = hostedGitInfo.fromUrl(bundle.url);
		bundles.push(bundle);
	}
	return bundles;
}

function gatherNeededCredentials(deploymentDefinition) {
	return new Promise(resolve => {
		const credentials = {
			bitbucket: {
				username: config.bitBucketUsername,
				password: config.bitBucketPassword
			},
			github: {
				token: config.gitHubToken
			},
			publickey: config.publicKey
		};

		// If we already have credentials for every service that we support (currently just BitBucket
		// and GitHub), then we can bail out early and return those credentials.
		if (config.bitBucketUsername && config.bitBucketPassword && config.gitHubToken && config.publicKey) {
			return resolve({
				bitbucket: {
					username: config.bitBucketUsername,
					password: config.bitBucketPassword
				},
				github: {
					token: config.gitHubToken
				},
				publickey: config.publicKey
			});
		}

		// Else, we need to determine what credentials we need before continuing.
		let bitbucketCredentialsNeeded = false;
		let githubCredentialsNeeded = false;
		const permissionCheckPromises = [];
		deploymentDefinition.bundles.forEach(bundle => {
			let promise;
			if (bundle.hostedGitInfo.type === 'bitbucket') {
				// Do nothing if we already have credentials for BitBucket.
				if (config.bitBucketUsername && config.bitBucketPassword) {
					return;
				}

				// Check if the BitBucket repo needs authentication. If it does, note that for later.
				promise = unauthenticatedBitbucket.repo.fetch('endofline/ubi-division').then().catch(error => {
					if (error.status === 403) {
						bitbucketCredentialsNeeded = true;
					}
				});
			} else if (bundle.hostedGitInfo.type === 'github') {
				// Do nothing if we already have credentials for GitHub.
				if (config.bitBucketUsername && config.bitBucketPassword) {
					return;
				}

				// Check if the GitHub repo needs authentication. If it does, note that for later.
				promise = github.repos.getDownloads({
					owner: 'owner',
					repo: 'repo'
				}).then().catch(error => {
					// GitHub will return a 404 if trying to access a repo that you don't have permissions for,
					// rather than explicitly saying that you don't have access. So, it's possible that
					// at this point the user entered a non-existent repo, but we must assume that they didn't
					// and that we just need to authenticate before we can see it.
					if (error.code === 404) {
						githubCredentialsNeeded = true;
					}
				});
			} else {
				// TODO: handle unknown or other hostingProviders
			}

			permissionCheckPromises.push(promise);
		});

		Promise.all(permissionCheckPromises).then(() => {
			return getPublicKey().then(publicKey => {
				credentials.publickey = publicKey;
			});
		}).then(() => {
			if (githubCredentialsNeeded) {
				return getGitHubCredentials().then(token => {
					credentials.github = {token};
				});
			}
		}).then(() => {
			if (bitbucketCredentialsNeeded) {
				return getBitBucketCredentials().then(bbCreds => {
					credentials.bitbucket = bbCreds;
				});
			}
		}).then(() => {
			resolve(credentials);
		});
	});
}

function gatherDownloadUrls(deploymentDefinition, credentials) {
	console.log('credentials:', credentials);
	console.log('Authenticating to BitBucket with these credentials:', credentials.bitbucket);
	const authenticatedBitbucket = bitbucketjs(credentials.bitbucket);

	if (credentials.github && credentials.github.token) {
		github.authenticate({
			type: 'token',
			token: credentials.github.token
		});
	}

	const newDeploymentDefinition = clone(deploymentDefinition);

	const promises = [];
	newDeploymentDefinition.bundles.forEach(bundle => {
		let promise;
		if (bundle.hostedGitInfo.type === 'bitbucket') {
			promise = authenticatedBitbucket.repo.fetch(
				`${bundle.hostedGitInfo.user}/${bundle.hostedGitInfo.project}`
			).then(result => {
				return request({
					uri: result.links.tags.href,
					auth: {
						username: credentials.bitbucket.username,
						password: credentials.bitbucket.password
					},
					json: true
				});
			}).then(json => {
				const tagNames = json.values.map(tag => tag.name);
				const target = semver.maxSatisfying(tagNames, bundle.version);
				bundle.downloadUrl = `https://bitbucket.org/${bundle.hostedGitInfo.user}/${bundle.hostedGitInfo.project}/get/${target}.zip`;
			});
		} else if (bundle.hostedGitInfo.type === 'github') {
			promise = github.repos.getDownloads({
				owner: 'owner',
				repo: 'repo'
			}).then();
		} else {
			// TODO: handle unknown or other hosting providers
		}

		promises.push(promise);
	});

	return Promise.all(promises).then(() => {
		return newDeploymentDefinition;
	});
}

// TODO: Files should be owned by DROPLET_USERNAME
function generateCloudConfig(deploymentDefinitionWithDownloadUrls, credentials) {
	const cloudConfig = new CloudConfig('templates/cloud-config.yml');

	cloudConfig.addSshKey(DROPLET_USERNAME, credentials.publickey);
	cloudConfig.addPassword(DROPLET_USERNAME, sshPassword);

	if (deploymentDefinitionWithDownloadUrls.nodecg.config) {
		cloudConfig.addWriteFile(`${NODECG_DIR}/cfg/nodecg.json`, deploymentDefinitionWithDownloadUrls.nodecg.config);
	}

	cloudConfig.replace('{{nodejs_version}}', deploymentDefinitionWithDownloadUrls.nodejs_version || latest);
	cloudConfig.replace('{{domain}}', deploymentDefinitionWithDownloadUrls.domain);
	cloudConfig.replace('{{port}}', deploymentDefinitionWithDownloadUrls.nodecg.port || 9090);
	cloudConfig.replace('{{email}}', deploymentDefinitionWithDownloadUrls.email);

	// Download NodeCG
	return getNodecgTarballUrl(deploymentDefinitionWithDownloadUrls.nodecg.version).then(nodecgTarballUrl => {
		cloudConfig.addDownload(nodecgTarballUrl, {
			dest: `/home/${DROPLET_USERNAME}/nodecg.zip`,
			unpack: true
		});

		deploymentDefinitionWithDownloadUrls.bundles.forEach(bundle => {
			cloudConfig.addDownload(bundle.downloadUrl, {
				dest: `${BUNDLES_DIR}/${bundle.name}.zip`,
				unpack: true,
				auth: {
					username: credentials.bitbucket.username,
					password: credentials.bitbucket.password
				}
			});

			// BitBucket's zips have a folder within them with the name ${user}-${repo}-${hash},
			// so we need to rename this folder to just be ${repo}.
			if (bundle.hostedGitInfo.type === 'bitbucket') {
				cloudConfig.addCommand(`find ${BUNDLES_DIR}/* -maxdepth 0 -type d -name "*${bundle.name}*" -execdir mv {} ${bundle.name} \\;`);
			}

			if (bundle.config) {
				cloudConfig.addWriteFile(`${NODECG_DIR}/cfg/${bundle.name}.json`, bundle.config);
			}
		});

		return cloudConfig;
	});
}
