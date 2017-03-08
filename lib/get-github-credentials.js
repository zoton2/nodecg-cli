'use strict';

// Packages
const inquirer = require('inquirer');

// Ours
const cfg = require('../lib/cfg');

const config = cfg.read();

module.exports = async function () {
	if (config.gitHubToken && config.gitHubUsername) {
		return {
			username: config.gitHubUsername,
			token: config.gitHubToken
		};
	}

	return await inquirer.prompt([{
		name: 'gitHubUsername',
		message: 'Enter your GitHub username:',
		type: 'text',
		default: config.gitHubUsername
	}, {
		name: 'gitHubToken',
		message: 'Enter a GitHub access token with the "repo" permission ' +
		'(https://github.com/settings/tokens/new):',
		type: 'password',
		default: config.gitHubToken
	}]).then(answers => {
		cfg.merge(answers);
		return {
			username: answers.gitHubUsername,
			token: answers.gitHubToken
		};
	});
};

