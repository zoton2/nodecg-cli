'use strict';

const chalk = require('chalk');
const info = require('../utils/output/info');
const error = require('../utils/output/error');
const code = require('../utils/output/code');
const progressLog = require('single-line-log').stdout;
const splitLines = require('split-lines');
const ansiEscapes = require('ansi-escapes');

module.exports = async function ({ssh}) {
	console.log(); // print blank line
	info('Wait for cloud-init to complete on droplet (this may take up to 15 minutes)');
	process.stdout.write(ansiEscapes.cursorSavePosition);

	// Use the underlying SSH2 instances directly for streaming
	// https://github.com/steelbrain/node-ssh/issues/35#issuecomment-249749739
	ssh.connection.exec('tail -f /var/log/cloud-init-output.log', (err, stream) => {
		if (err) {
			throw err;
		}

		stream.on('data', data => {
			const str = splitLines(data.toString())[0];
			if (str.trim().length > 0) {
				progressLog(str);
			}
		});
	});

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

				error(`cloud-init failed: ${result.stderr}`);
				error(`SSH into the server and check the contents of ${code('/var/log/cloud-init-output.log')} for more details`);
				reject();
			}).catch(error => {
				keepTrying = false;
				reject(error);
				// TODO: ask to clean up changes?
			});
			/* eslint-enable no-loop-func */
		}
	});

	process.stdout.write(ansiEscapes.cursorRestorePosition);
	process.stdout.write(ansiEscapes.eraseDown);
	process.stdout.write(ansiEscapes.cursorRestorePosition);
	process.stdout.write(`${chalk.cyan('✓')} Wait for cloud-init to complete on droplet\n`);
};
