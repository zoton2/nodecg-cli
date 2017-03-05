'use strict';

const chalk = require('chalk');
const NodeSSH = require('node-ssh');
const error = require('../utils/output/error');
const wait = require('../utils/output/wait');
const ssh = new NodeSSH();

module.exports = async function ({decisions, credentials}) {
	const dropletIp = decisions.droplet.networks.v4[0].ip_address;
	const stopSshToDropletSpinner = wait(`ssh to droplet (${dropletIp})`);

	// TODO: Have a timeout for this
	await new Promise(async (resolve, reject) => {
		let keepTrying = true;
		while (keepTrying === true) {
			/* eslint-disable no-loop-func */
			await ssh.connect({
				host: dropletIp,
				username: 'nodecg',
				privateKey: credentials.keypair.private
			}).then(() => {
				keepTrying = false;
				resolve();
			}).catch(err => {
				if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' ||
					err.message === 'Timed out while waiting for handshake') {
					// retry
				} else {
					stopSshToDropletSpinner();
					keepTrying = false;
					process.stdout.write(`${chalk.red('✗')} ssh to droplet\n`);

					if (err.code) {
						error(`Failed to ssh to droplet: ${err.code}`);
					} else {
						error(`Failed to ssh to droplet: ${err}`);
					}

					reject(err);
				}
			});
			/* eslint-enable no-loop-func */
		}
	});
	stopSshToDropletSpinner();
	process.stdout.write(`${chalk.cyan('✓')} ssh to droplet\n`);

	return ssh;
};

