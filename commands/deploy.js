'use strict';

// TODO: rewrite to use got instead of request

// Native
const fs = require('fs');

// Packages
const bitbucketjs = require('bitbucketjs');
const chalk = require('chalk');
const clone = require('clone');
const DigitalOcean = require('digitalocean-v2');
const escapeStringRegexp = require('escape-string-regexp');

const GitHubApi = require('github');
const hostedGitInfo = require('hosted-git-info');
const request = require('request-promise');
const semver = require('semver');
const Mustache = require('mustache');

// Ours
const cfg = require('../lib/cfg');
const CloudConfig = require('../lib/cloud-config');
const error = require('../lib/utils/output/error');
const genreateKeypair = require('../lib/generateKeypair');
const getBitBucketCredentials = require('../lib/get-bitbucket-credentials');
const getDigitalOceanCredentials = require('../lib/get-digitalocean-credentials');
const getGitHubCredentials = require('../lib/get-github-credentials');
const getNodecgTarballUrl = require('../lib/get-nodecg-tarball-url');
const getPublicKey = require('../lib/get-public-key');
const success = require('../lib/utils/output/success');
const wait = require('../lib/utils/output/wait');

const config = cfg.read();
const github = new GitHubApi();
const unauthenticatedBitbucket = bitbucketjs();
const DROPLET_USERNAME = 'nodecg';
const NODECG_DIR = `/home/${DROPLET_USERNAME}/nodecg`;
const BUNDLES_DIR = `${NODECG_DIR}/bundles`;

module.exports = function (program) {
	program
		.command('deploy <filePath>')
		.description('Deploys the given NodeCG instance to DigitalOcean')
		.action(function () {
			return action.apply(action, arguments).catch(error => {
				console.error(error);
			});
		});
};

async function action(filePath) {
	// TODO: json schema with defaults
	const file = fs.readFileSync(filePath);
	let deploymentDefinition = JSON.parse(file);
	deploymentDefinition.bundles = parseBundles(deploymentDefinition);

	/*
	 1. Make the Block Storage volume if it doesn't yet exist.
	 2. Make the droplet with name "${name}-staging", but don't attach the volume yet. It will mostly auto-provision thanks to the cloud-init script.
	 3. Wait for the droplet to finish being provisioned. (Don't yet have a good way of signaling when this has happened)
	 4. Assign the Floating IP to the new droplet, and attach the Block Storage volume to it.
	 5. Run a small script that makes a new LE cert *only if* there isn't one already on the volume.
	 6.
	 */

	const credentials = await gatherNeededCredentials(deploymentDefinition);
	const digitalOceanApi = new DigitalOcean(credentials.digitalocean);

	const stopGatherDownloadUrlsSpinner = wait('Gather download URLs for NodeCG and bundles');
	deploymentDefinition = await gatherDownloadUrls(deploymentDefinition, credentials);
	stopGatherDownloadUrlsSpinner();
	process.stdout.write(`${chalk.cyan('✓')} Gather download URLs for NodeCG and bundles\n`);

	const stopGenerateKeypairSpinner = wait('Generate keypair (will be discarded after initial setup)');
	credentials.keypair = genreateKeypair();
	stopGenerateKeypairSpinner();
	process.stdout.write(`${chalk.cyan('✓')} Generate keypair (will be discarded after initial setup)\n`);

	const stopGenerateCloudConfigSpinner = wait('Generate cloud-init script');
	const cloudConfig = await generateCloudConfig(deploymentDefinition, credentials);
	stopGenerateCloudConfigSpinner();
	process.stdout.write(`${chalk.cyan('✓')} Generate cloud-init script\n`);

	const decisions = {
		useBlockStorage: true,
		useFloatingIp: true,
		chosenRegion: deploymentDefinition.droplet.region,
		chosenFloatingIp: deploymentDefinition.droplet.floating_ip,
		chosenVolume: {id: deploymentDefinition.droplet.volume_id},
		droplet: null
	};

	// Changes useBlockStorage and chosenRegion (because not every region supports block storage)
	const chooseRegion = require('../lib/deploy/region.js');
	await chooseRegion(deploymentDefinition, digitalOceanApi, decisions);

	/* At this point, we don't allow any more region changes.
	 * If we encounter something that requires changing region to continue, we abort.
	 */

	// Changes useFloatingIp and chosenFloatingIp.
	const chooseFloatingIp = require('../lib/deploy/floating-ip.js');
	await chooseFloatingIp(deploymentDefinition, digitalOceanApi, decisions);

	if (decisions.useFloatingIp) {
		const waitUntilDomainResolvesToFloatingIp = require('../lib/deploy/wait-until-domain-resolves-to-floating-ip');
		await waitUntilDomainResolvesToFloatingIp({
			deploymentDefinition, decisions
		});
	}

	if (decisions.useBlockStorage && !deploymentDefinition.droplet.volume_id) {
		// Changes chosenVolume
		const chooseVolume = require('../lib/deploy/volume.js');
		await chooseVolume(deploymentDefinition, digitalOceanApi, decisions);
	}

	// TODO: prompt to destroy and existing droplets with same name

	if (decisions.chosenRegion !== deploymentDefinition.droplet.region ||
		decisions.chosenVolume.id !== deploymentDefinition.volume.id) {
		// TODO: prompt to write changes back to deployment definition (region, volume_id)
	}

	const createDroplet = require('../lib/deploy/create-droplet.js');
	decisions.droplet = await createDroplet({
		deploymentDefinition, digitalOceanApi, cloudConfig, decisions, credentials
	});

	if (decisions.useFloatingIp) {
		const stopAssignFloatingIPSpinner = wait('Assign Floating IP to droplet');
		await digitalOceanApi.assignFloatingIP(decisions.chosenFloatingIp, decisions.droplet.id);
		stopAssignFloatingIPSpinner();
		process.stdout.write(`${chalk.cyan('✓')} Assign Floating IP to droplet\n`);
	}

	const sshToDroplet = require('../lib/deploy/ssh-to-droplet.js');
	const ssh = await sshToDroplet({decisions, credentials});

	if (decisions.useBlockStorage) {
		const mountVolume = require('../lib/deploy/mount-volume.js');
		await mountVolume({decisions, ssh});
	}

	const waitForCloudInit = require('../lib/deploy/wait-for-cloud-init.js');
	await waitForCloudInit({ssh});

	// Remove our setup key from authorized_keys
	const stopRemoveSetupKeySpinner = wait('Remove setup key from authorized_keys');
	const removeSetupKeyResult = await ssh.execCommand(
		`sed -i -e '/${escapeStringRegexp(credentials.keypair.ssh.slice(-18).slice(2, 16))}/d' /home/nodecg/.ssh/authorized_keys`
	);
	stopRemoveSetupKeySpinner();

	if (removeSetupKeyResult.stderr) {
		process.stdout.write(`${chalk.red('✗')} Remove setup key from authorized_keys\n`);
		error(removeSetupKeyResult.stderr);
		process.exit(1);
	} else {
		process.stdout.write(`${chalk.cyan('✓')} Remove setup key from authorized_keys\n`);
		success('NodeCG deployed!');
		process.exit(0);
	}
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
	// TODO: ask for multiple public keys
	return new Promise(resolve => {
		const credentials = {
			bitbucket: {
				username: config.bitBucketUsername,
				password: config.bitBucketPassword
			},
			github: {
				token: config.gitHubToken
			},
			publickey: config.publicKey,
			digitalocean: {
				token: config.digitalOceanToken
			}
		};

		// If we already have credentials for every service that we support (currently just BitBucket
		// and GitHub), then we can bail out early and return those credentials.
		if (config.bitBucketUsername && config.bitBucketPassword && config.gitHubToken && config.publicKey &&
			config.digitalOceanToken) {
			return resolve({
				bitbucket: {
					username: config.bitBucketUsername,
					password: config.bitBucketPassword
				},
				github: {
					token: config.gitHubToken
				},
				publickey: config.publicKey,
				digitalocean: {
					token: config.digitalOceanToken
				}
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
			return getDigitalOceanCredentials().then(token => {
				credentials.digitalocean = {token};
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
				bundle.downloadUrl = `https://bitbucket.org/${bundle.hostedGitInfo.user}/${bundle.hostedGitInfo.project}/get/${target}.tar.gz`;
			});
		} else if (bundle.hostedGitInfo.type === 'github') {
			// TODO: actually handle github downloads instead of just having this stub
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

async function generateCloudConfig(deploymentDefinition, credentials) {
	const cloudConfig = new CloudConfig('templates/cloud-config.yml');

	cloudConfig.addSshKey(DROPLET_USERNAME, credentials.publickey);
	cloudConfig.addSshKey(DROPLET_USERNAME, credentials.keypair.ssh); // Only used during setup, then deleted from authorized_keys.

	if (deploymentDefinition.nodecg.config) {
		cloudConfig.addWriteFile({
			path: `${NODECG_DIR}/cfg/nodecg.json`,
			content: deploymentDefinition.nodecg.config
		});
	}

	cloudConfig.replace('{{nodejs_version}}', deploymentDefinition.nodejs_version);
	cloudConfig.replace('{{email}}', deploymentDefinition.email);

	const nginxSiteTemplate = deploymentDefinition.secure ?
		fs.readFileSync('templates/nginx-site-secure.mst', 'utf-8') :
		fs.readFileSync('templates/nginx-site-insecure.mst', 'utf-8');

	// TODO: look into NodeCG's own `secure` setting
	cloudConfig.addWriteFile({
		owner: 'root:root',
		path: '/etc/nginx/sites-available/nodecg',
		content: Mustache.render(nginxSiteTemplate, {
			domain: deploymentDefinition.domain,
			port: deploymentDefinition.nodecg.port
		})
	});

	if (deploymentDefinition.secure) {
		cloudConfig.addWriteFile({
			owner: 'root:root',
			path: '/etc/cron.d/letsencrypt_auto_renew',
			content: fs.readFileSync('templates/letsencrypt-cronjob')
		});

		cloudConfig.addPackage('letsencrypt');

		cloudConfig.addCommand('service nginx stop');
		cloudConfig.addCommand(`letsencrypt certonly --standalone --non-interactive --agree-tos --email ${deploymentDefinition.email} -d ${deploymentDefinition.domain}`);
		cloudConfig.addCommand('service nginx start');
	}

	await getNodecgTarballUrl(deploymentDefinition.nodecg.version).then(nodecgTarballUrl => {
		cloudConfig.addDownload(nodecgTarballUrl, {
			dest: `/home/${DROPLET_USERNAME}/nodecg.tar.gz`,
			untar: true,
			stripComponents: 1,
			cmdPosition: 0,
			curlOpts: '-L',
			extractTo: NODECG_DIR
		});

		deploymentDefinition.bundles.forEach(bundle => {
			cloudConfig.addCommand(`mkdir ${BUNDLES_DIR}/${bundle.name}`);

			cloudConfig.addDownload(bundle.downloadUrl, {
				dest: `${BUNDLES_DIR}/${bundle.name}.tar.gz`,
				untar: true,
				stripComponents: 1,
				auth: {
					username: credentials.bitbucket.username,
					password: credentials.bitbucket.password
				},
				extractTo: `${BUNDLES_DIR}/${bundle.name}`
			});

			if (bundle.config) {
				cloudConfig.addWriteFile({
					path: `${NODECG_DIR}/cfg/${bundle.name}.json`,
					content: bundle.config
				});
			}
		});
	});

	// Transfer ownership of these newly-downloaded files to the nodecg user
	cloudConfig.addCommand(`chown -R ${DROPLET_USERNAME}:${DROPLET_USERNAME} /home/nodecg/`);

	// Start pm2
	cloudConfig.addCommand('su - nodecg -c \'pm2 start /home/nodecg/nodecg/index.js --name=nodecg\'');

	// Restart nginx
	cloudConfig.addCommand('service nginx restart');

	return cloudConfig;
}
