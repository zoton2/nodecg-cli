'use strict';

// Packages
const inquirer = require('inquirer');

// Ours
const cfg = require('../lib/cfg');

const config = cfg.read();

module.exports = function () {
	return new Promise(resolve => {
		if (config.bitBucketUsername && config.bitBucketPassword) {
			return resolve(config.publicKey);
		}

		inquirer.prompt([{
			name: 'bitBucketUsername',
			message: 'Enter your BitBucket username:',
			type: 'text'
		}, {
			name: 'bitBucketPassword',
			message: 'Enter a BitBucket app password that has the "Read Repositories" permission ' +
			'(https://bitbucket.org/account/admin/app-passwords):',
			type: 'password'
		}]).then(answers => {
			cfg.merge(answers);
			resolve({
				username: answers.bitBucketUsername,
				password: answers.bitBucketPassword
			});
		});
	});
};
