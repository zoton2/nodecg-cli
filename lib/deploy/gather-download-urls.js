'use strict';

const clone = require('clone');
const request = require('request-promise');
const semver = require('semver');
const bitbucketjs = require('bitbucketjs');

module.exports = function ({deploymentDefinition, credentials, github}) {
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
			promise = github.repos.getTags({
				owner: bundle.hostedGitInfo.user,
				repo: bundle.hostedGitInfo.project
			}).then(result => {
				const tags = result.data;
				const tagNames = tags.map(tag => tag.name);
				const targetTagName = semver.maxSatisfying(tagNames, bundle.version);
				const targetTag = tags.find(tag => tag.name === targetTagName);
				bundle.downloadUrl = targetTag.tarball_url;
			});
		} else {
			// TODO: handle unknown or other hosting providers
		}

		promises.push(promise);
	});

	return Promise.all(promises).then(() => {
		return newDeploymentDefinition;
	});
};
