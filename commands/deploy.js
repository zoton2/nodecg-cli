'use strict';

const fs = require('fs');
const path = require('path');
const DigitalOcean = require('do-wrapper');
const keytar = require('keytar');
const inquirer = require('inquirer');
const hostedGitInfo = require('hosted-git-info');
const bitbucketjs = require('bitbucketjs');
const unauthenticatedBitbucket = bitbucketjs();
const GitHubApi = require('github');
const github = new GitHubApi();

// Keytar doesn't support "finding" account names, only passwords. Kind of odd.
// We work around that by storing the username as a password as well.
// See https://github.com/atom/node-keytar/issues/36
// and https://github.com/atom/node-keytar/issues/56
// Some ideas borrowed from https://github.com/jasonbarone/ultradns-node-cli/blob/master/src/utils/auth-token.js
const BITBUCKET_USERNAME_NAMESPACE = 'nodecg-bitbucket-username';
const BITBUCKET_PASSWORD_NAMESPACE = 'nodecg-bitbucket-password';
const GITHUB_TOKEN_NAMESPACE = 'nodecg-github-token';

module.exports = function (program) {
	program
		.command('deploy <filePath>')
		.description('Deploys the given NodeCG instance to DigitalOcean')
		.action(action);
};

function action(filePath) {
	console.log('Parsing deployment definition:', filePath);
	const file = fs.readFileSync(filePath);
	const deploymentDefinition = JSON.parse(file);
	console.log('Deployment defintion:', deploymentDefinition);
	const digitalOceanApi = new DigitalOcean('[api_key]');

	gatherNeededCredentials(deploymentDefinition).then(credentials => {
		console.log(credentials);
		return;

		const authenticatedBitbucket = bitbucketjs(credentials.bitbucket);
		github.authenticate({
			type: 'token',
			token: credentials.github.token
		});
	});
}

function gatherNeededCredentials(deploymentDefinition) {
	return new Promise(resolve => {
		const existingBitBucketCredentials = {
			username: keytar.findPassword(BITBUCKET_USERNAME_NAMESPACE),
			password: keytar.findPassword(BITBUCKET_PASSWORD_NAMESPACE)
		};

		const existingGitHubCredentials = {
			token: keytar.findPassword(GITHUB_TOKEN_NAMESPACE)
		};

		const foundValidBitBucketCredentials = typeof existingBitBucketCredentials.username === 'string' &&
			existingBitBucketCredentials.username.length > 0 &&
			typeof existingBitBucketCredentials.password === 'string' &&
			existingBitBucketCredentials.password.length > 0;
		const foundValidGitHubCredentials = typeof existingGitHubCredentials.token === 'string' &&
			existingGitHubCredentials.token.length > 0;

		// If we already have credentials for every service that we support (currently just BitBucket
		// and GitHub), then we can bail out early and return those credentials.
		if (foundValidBitBucketCredentials && foundValidGitHubCredentials) {
			return resolve({
				bitbucket: existingBitBucketCredentials,
				github: existingGitHubCredentials
			});
		}

		// Else, we need to determine what credentials we need before continuing.
		let bitbucketCredentialsNeeded = false;
		let githubCredentialsNeeded = false;
		const promises = [];
		for (const bundle in deploymentDefinition.bundles) {
			if (!{}.hasOwnProperty.call(deploymentDefinition.bundles, bundle)) {
				continue;
			}

			const hostingProvider = hostedGitInfo.fromUrl(deploymentDefinition.bundles[bundle].url).type;
			let promise;
			if (hostingProvider === 'bitbucket' && !foundValidBitBucketCredentials) {
				promise = unauthenticatedBitbucket.repo.fetch('endofline/ubi-division').then().catch(error => {
					if (error.status === 403) {
						bitbucketCredentialsNeeded = true;
					}
				});
			} else if (hostingProvider === 'github' && !foundValidGitHubCredentials) {
				github.repos.getDownloads({
					owner: 'owner',
					repo: 'repo'
				}).then().catch(error => {
					// GitHub will return a 404 if trying to access a repo that you don't have permissions for,
					// rather than explicitly saying that you don't have access. So, it's possible that
					// at this point the user entered a non-existant repo, but we must assume that they didn't
					// and that we just need to authenticate before we can see it.
					if (error.code === 404) {
						githubCredentialsNeeded = true;
					}
				});
			}

			promises.push(promise);
		}

		Promise.all(promises).then(() => {
			const questions = [];

			if (bitbucketCredentialsNeeded) {
				questions.push({
					name: 'bitBucketUsername',
					message: 'Enter your BitBucket username:',
					type: 'text'
				}, {
					name: 'bitBucketAppPassword',
					message: 'Enter a BitBucket app password that has the "Read Repositories" permission ' +
					'(https://bitbucket.org/account/admin/app-passwords):',
					type: 'password'
				});
			}

			if (githubCredentialsNeeded) {
				questions.push({
					name: 'gitHubToken',
					message: 'Enter a GitHub access token "repo" permission ' +
					'(https://github.com/settings/tokens/new):',
					type: 'password'
				});
			}

			inquirer.prompt(questions).then(answers => {
				console.log('answers:', answers);
				if (answers.bitBucketUsername) {
					const result = keytar.addPassword(BITBUCKET_USERNAME_NAMESPACE, BITBUCKET_USERNAME_NAMESPACE, answers.bitBucketUsername);
					console.log('Added BitBucket Username?', result);
				}

				if (answers.bitBucketAppPassword) {
					const result = keytar.addPassword(BITBUCKET_PASSWORD_NAMESPACE, BITBUCKET_PASSWORD_NAMESPACE, answers.bitBucketAppPassword);
					console.log('Added BitBucket Password?', result);
				}

				if (answers.gitHubToken) {
					keytar.addPassword(GITHUB_TOKEN_NAMESPACE, GITHUB_TOKEN_NAMESPACE, answers.gitHubToken);
				}

				resolve({
					github: {
						token: answers.gitHubToken || existingGitHubCredentials.token
					},
					bitbucket: {
						username: answers.bitBucketUsername || existingBitBucketCredentials.username,
						password: answers.bitBucketAppPassword || existingBitBucketCredentials.password
					}
				});
			});
		});
	});
}
