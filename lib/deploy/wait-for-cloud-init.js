'use strict';

const chalk = require('chalk');
const wait = require('../utils/output/wait');
const error = require('../utils/output/error');

module.exports = async function ({ssh}) {
	// TODO: could use `tail -f /var/log/cloud-init-output.log` to print live output of cloud-init?
	const stopWaitForCloudInitSpinner = wait('Wait for cloud-init to complete on droplet (this may take up to 15 minutes)');

	await new Promise(async (resolve, reject) => {
		let keepTrying = true;
		while (keepTrying === true) {
			/* eslint-disable no-loop-func */
			// Wait two seconds
			await new Promise(resolve => {
				setTimeout(resolve, 2000);
			});

			await ssh.execCommand(
				'[ -f /var/lib/cloud/data/result.json ] && cat /var/lib/cloud/data/result.json || echo "Not found"'
			).then(result => {
				if (result.stdout === 'Not found') {
					return;
				}

				keepTrying = false;

				if (result.stdout) {
					try {
						const resultJson = JSON.parse(result.stdout).v1;
						if (Array.isArray(resultJson.errors) && resultJson.errors.length > 0) {
							error(`cloud-init failed:\n\t${resultJson.errors.join('\n\t')}`);
							return reject();
						}

						return resolve();
					} catch (e) {
						console.log('bad json:', result.stdout);
						return reject();
					}
				}

				error(`cloud-init failed:\n\t${result.stderr}`);
				reject();
			}).catch(error => {
				keepTrying = false;
				stopWaitForCloudInitSpinner();
				reject(error);
				process.exit(1);
				// TODO: ask to clean up changes?
			});
			/* eslint-enable no-loop-func */
		}
	});

	stopWaitForCloudInitSpinner();
	process.stdout.write(`${chalk.cyan('✓')} Wait for cloud-init to complete on droplet\n`);
};
