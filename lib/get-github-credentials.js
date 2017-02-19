'use strict';

// Packages
const inquirer = require('inquirer');

// Ours
const cfg = require('../lib/cfg');

const config = cfg.read();

module.exports = function () {
	return new Promise(resolve => {
		if (config.gitHubToken && config.gitHubToken) {
			return resolve(config.gitHubToken);
		}

		inquirer.prompt([{
			name: 'gitHubToken',
			message: 'Enter a GitHub access token "repo" permission ' +
			'(https://github.com/settings/tokens/new):',
			type: 'password'
		}]).then(answers => {
			cfg.merge(answers);
			resolve(answers.gitHubToken);
		});
	});
};

function getGithubToken() {
	var prefs = new Preferences('ginit');

	if (prefs.github && prefs.github.token) {
		return callback(null, prefs.github.token);
	}

	// Fetch token
	getGithubCredentials(function(credentials) {
		var status = new Spinner('Authenticating you, please wait...');
		status.start();

		github.authenticate(
			_.extend({
				type: 'basic'
			}, credentials)
		);

		github.authorization.create({
			scopes: ['user', 'public_repo', 'repo', 'repo:status'],
			note: 'nodecg-cli, the command-line tool for NodeCG',
			note_url: 'https://github.com/nodecg/nodecg',
			headers: {
				'X-GitHub-OTP': 'two-factor-code'
			}
		}, (err, res) => {
			status.stop();
			if (err) {
				return reject(err);
			}

			if (res.token) {
				prefs.github = {
					token : res.token
				};
				return callback(null, res.token);
			}
			return callback();
		});
	});
}
