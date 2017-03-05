'use strict';

const chalk = require('chalk');
const inquirer = require('inquirer');
const wait = require('../utils/output/wait');
const info = require('../utils/output/info');
const error = require('../utils/output/error');
const code = require('../utils/output/code');

module.exports = async function (deploymentDefinition, digitalOceanApi, decisions) {
	// If the deployment definition does not specify a volume_id, ask if they would like to make
	// a new volume or use an existing volume.
	const {shouldCreateVolume} = await inquirer.prompt([{
		type: 'list',
		name: 'shouldCreateVolume',
		message: `Your deployment definition does not specify a ${code('droplet.volume_id')} to use for ` +
		'Block Storage. Would you like to create a new Block Storage volume or choose an existing one?',
		choices: [{
			name: 'Create a new volume',
			value: true
		}, {
			name: 'Choose an existing volume',
			value: false
		}]
	}]);

	if (shouldCreateVolume) {
		const stopCreateVolumeSpinner = wait('Create Block Storage volume');
		decisions.chosenVolume = await digitalOceanApi.createVolume({
			size_gigabytes: deploymentDefinition.volume.size_gigabytes, // eslint-disable-line camelcase
			name: deploymentDefinition.volume.name,
			region: decisions.chosenRegion
		});
		stopCreateVolumeSpinner();
		process.stdout.write(`${chalk.cyan('✓')} Create Block Storage volume\n`);
	} else {
		const availableVolumes = await digitalOceanApi.listVolumes(decisions.chosenRegion);
		if (availableVolumes.length <= 0) {
			// Tell the user that they have no path forward and abort.
			error(`You opted to use an existing volume, but you have none!`);
			process.exit(1);
		}

		decisions.chosenVolume = await inquirer.prompt([{
			type: 'list',
			name: 'volume',
			message: 'Please choose a Block Storage volume to use for this deployment',
			choices: availableVolumes.map(volume => {
				const numDroplets = volume.droplet_ids.length;
				const name = numDroplets > 0 ?
					`${volume.name} (Currently attached to ${numDroplets} other droplet(s))` :
					volume.name;
				return {
					name,
					value: volume
				};
			})
		}]).then(answers => {
			return answers.volume;
		});

		if (decisions.chosenVolume.droplet_ids.length >= 2) {
			error(`Volume ${decisions.chosenVolume.name} is attached to multiple droplets, which means that` +
				'DigitalOcean has rolled out some new features! Tell Lange to update this program.');
			process.exit(1);
		}

		if (decisions.chosenVolume.droplet_ids.length === 1) {
			const oldDroplet = await digitalOceanApi.getDroplet(decisions.chosenVolume.droplet_ids[0]);
			const {oldDropletAction} = await inquirer.prompt([{
				type: 'list',
				name: 'oldDropletAction',
				message: `Volume "${decisions.chosenVolume.name}" is currently attached to droplet "${oldDroplet.name}". How do you want to proceed?`,
				choices: [{
					name: `Destroy droplet "${oldDroplet.name}"`,
					value: 'destroy'
				}, {
					name: `Shutdown droplet "${oldDroplet.name}"`,
					value: 'shutdown'
				}, {
					name: 'Abort (make no changes and cancel this deployment)',
					value: 'abort'
				}]
			}]);

			if (oldDropletAction === 'abort') {
				info('Deployment aborted.');
				process.exit(1);
			}

			if (oldDropletAction === 'shutdown') {
				await digitalOceanApi.shutdownDroplet(oldDroplet.id);
				await digitalOceanApi.detachVolume(decisions.chosenVolume.id, oldDroplet.id);
			}

			if (oldDropletAction === 'destroy') {
				// Destroying the old droplet automatically detaches all volumes from it.
				await digitalOceanApi.deleteDroplet(oldDroplet.id);
			}
		}
	}
};
