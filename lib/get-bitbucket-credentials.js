'use strict';

// Packages
const inquirer = require('inquirer');

// Ours
const cfg = require('../lib/cfg');

const config = cfg.read();

module.exports = async function () {
	if (config.bitBucketUsername && config.bitBucketPassword) {
		return {
			username: config.bitBucketUsername,
			password: config.bitBucketPassword
		};
	}

	return await inquirer.prompt([{
		name: 'bitBucketUsername',
		message: 'Enter your BitBucket username:',
		type: 'text',
		default: config.bitBucketUsername
	}, {
		name: 'bitBucketPassword',
		message: 'Enter a BitBucket app password that has the "Read Repositories" permission ' +
		'(https://bitbucket.org/account/admin/app-passwords):',
		type: 'password',
		default: config.bitBucketPassword
	}]).then(answers => {
		cfg.merge(answers);
		return {
			username: answers.bitBucketUsername,
			password: answers.bitBucketPassword
		};
	});
};
