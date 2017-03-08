'use strict';

// Native
const fs = require('fs');

const chalk = require('chalk');
const fingerprint = require('ssh-fingerprint');
const wait = require('../utils/output/wait');

module.exports = async function ({deploymentDefinition, digitalOceanApi, cloudConfig, decisions, credentials}) {
	const stopCreateDropletSpinner = wait('Create droplet');
	const dropletConfig = Object.assign({}, deploymentDefinition.droplet);

	if (decisions.useBlockStorage) {
		dropletConfig.volumes = [decisions.chosenVolume.id];
	}

	dropletConfig.ssh_keys = [fingerprint(credentials.publickey)]; // eslint-disable-line camelcase
	dropletConfig.user_data = cloudConfig.dump(); // eslint-disable-line camelcase

	if (deploymentDefinition.debug) {
		fs.writeFileSync(`${Date.now()}_cloud-config.yml`, dropletConfig.user_data, 'utf-8');
	}

	const dropletCreationResult = await digitalOceanApi.createDroplet(dropletConfig);
	stopCreateDropletSpinner();
	process.stdout.write(`${chalk.cyan('✓')} Create droplet\n`);

	// Keep getting droplet info until it tells us what its IPv4 address is
	const stopWaitForBootSpinner = wait('Wait for droplet to finish booting');
	const droplet = await new Promise(resolve => {
		const interval = setInterval(() => {
			digitalOceanApi.getDroplet(dropletCreationResult.id).then(dropletStatus => {
				if (dropletStatus.status === 'active') {
					clearInterval(interval);
					resolve(dropletStatus);
				}
			});
		}, 2500);
	});
	stopWaitForBootSpinner();
	process.stdout.write(`${chalk.cyan('✓')} Wait for droplet to finish booting\n`);

	return droplet;
};
