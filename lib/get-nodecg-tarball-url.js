'use strict';

// Packages
const GitHubApi = require('github');
const semver = require('semver');

const github = new GitHubApi();

module.exports = function (semverRange = '*') {
	return github.repos.getReleases({
		owner: 'nodecg',
		repo: 'nodecg'
	}).then(result => {
		const releases = result.data;
		const tagNames = releases.map(release => release.tag_name);
		const targetTagName = semver.maxSatisfying(tagNames, semverRange);
		const targetRelease = releases.find(release => release.tag_name === targetTagName);
		return targetRelease.tarball_url;
	}).catch(e => {
		console.error(e);
	});
};
