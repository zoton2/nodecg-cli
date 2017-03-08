'use strict';

const bitbucketjs = require('bitbucketjs');
const cfg = require('../cfg');
const getBitBucketCredentials = require('../get-bitbucket-credentials');
const getDigitalOceanCredentials = require('../get-digitalocean-credentials');
const getGitHubCredentials = require('../get-github-credentials');
const getPublicKey = require('../get-public-key');
const unauthenticatedBitbucket = bitbucketjs();
const config = cfg.read();

module.exports = async function ({deploymentDefinition, github}) {
	// TODO: ask for multiple public keys
	const credentials = {
		bitbucket: {
			username: config.bitBucketUsername,
			password: config.bitBucketPassword
		},
		github: {
			username: config.gitHubUsername,
			token: config.gitHubToken
		},
		publickey: config.publicKey,
		digitalocean: {
			token: config.digitalOceanToken
		}
	};

	// If we already have credentials for every service that we support (currently just BitBucket
	// and GitHub), then we can bail out early and return those credentials.
	if (config.bitBucketUsername && config.bitBucketPassword &&
		config.gitHubToken && config.gitHubUsername &&
		config.publicKey && config.digitalOceanToken) {
		return {
			bitbucket: {
				username: config.bitBucketUsername,
				password: config.bitBucketPassword
			},
			github: {
				username: config.gitHubUsername,
				token: config.gitHubToken
			},
			publickey: config.publicKey,
			digitalocean: {
				token: config.digitalOceanToken
			}
		};
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

	await Promise.all(permissionCheckPromises);

	credentials.publickey = await getPublicKey();
	credentials.digitalocean = await getDigitalOceanCredentials();

	if (githubCredentialsNeeded) {
		credentials.github = await getGitHubCredentials();
	}

	if (bitbucketCredentialsNeeded) {
		credentials.bitbucket = await getBitBucketCredentials();
	}

	return credentials;
};
