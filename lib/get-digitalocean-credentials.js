'use strict';

// Packages
const inquirer = require('inquirer');

// Ours
const cfg = require('../lib/cfg');

const config = cfg.read();

module.exports = function () {
	return new Promise(resolve => {
		if (config.digitalOceanToken) {
			return resolve(config.digitalOceanToken);
		}

		inquirer.prompt([{
			name: 'digitalOceanToken',
			message: 'Enter a DigitalOcean access token with "write" permission: ' +
			'(https://cloud.digitalocean.com/settings/api/tokens):',
			type: 'password'
		}]).then(answers => {
			cfg.merge(answers);
			resolve(answers.digitalOceanToken);
		});
	});
};
