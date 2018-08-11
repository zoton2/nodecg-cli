'use strict';

// Packages
const inquirer = require('inquirer');

// Ours
const cfg = require('../lib/cfg');

const config = cfg.read();

module.exports = function () {
	if (config.digitalOceanToken) {
		return {
			token: config.digitalOceanToken
		};
	}

	return inquirer.prompt([{
		name: 'digitalOceanToken',
		message: 'Enter a DigitalOcean access token with "write" permission: ' +
		'(https://cloud.digitalocean.com/settings/api/tokens):',
		type: 'password'
	}]).then(answers => {
		cfg.merge(answers);
		return {
			token: answers.digitalOceanToken
		};
	});
};
