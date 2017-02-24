'use strict';

// Packages
const inquirer = require('inquirer');

// Ours
const cfg = require('../lib/cfg');

const config = cfg.read();

module.exports = function () {
	return new Promise(resolve => {
		if (config.publicKey) {
			return resolve(config.publicKey);
		}

		inquirer.prompt([{
			name: 'publicKey',
			message: 'Enter your public key, which you will use to log into the droplet:',
			type: 'text'
		}]).then(answers => {
			cfg.merge(answers);
			resolve(answers.publicKey);
		});
	});
};
