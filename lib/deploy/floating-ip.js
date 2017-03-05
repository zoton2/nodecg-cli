'use strict';

const inquirer = require('inquirer');
const info = require('../utils/output/info');
const error = require('../utils/output/error');
const code = require('../utils/output/code');
const param = require('../utils/output/param');

module.exports = async function (deploymentDefinition, digitalOceanApi, decisions) {
	/*
	 If a floating_ip is specified
		and in this region
	 		and available
	 			use that floating_ip.
	 		else
	 			ask to free it and destroy/shutdown/abandon old droplet
		else
	 		ask to create a new floating_ip, choose another floating_ip, or not use a floating_ip
	 else
	 	ask to create a new floating_ip, choose another floating_ip, or not use a floating_ip
	 */

	if (decisions.chosenFloatingIp) {
		decisions.useFloatingIp = true;
		const floatingIp = await digitalOceanApi.getFloatingIp(decisions.chosenFloatingIp);
		if (floatingIp.region === decisions.chosenRegion) {
			if (floatingIp.droplet !== null) {
				const {oldDropletAction} = await inquirer.prompt([{
					type: 'list',
					name: 'oldDropletAction',
					message: `Floating IP "${decisions.chosenFloatingIp}" is currently assigned to droplet "${floatingIp.droplet.name}". How do you want to proceed?`,
					choices: [{
						name: `Destroy droplet "${floatingIp.droplet.name}"`,
						value: 'destroy'
					}, {
						name: `Unassign ${decisions.chosenFloatingIp} from droplet "${floatingIp.droplet.name}"`,
						value: 'unassign'
					}, {
						name: 'Abort (make no changes and cancel this deployment)',
						value: 'abort'
					}]
				}]);

				if (oldDropletAction === 'unassign') {
					await digitalOceanApi.unassignFloatingIP(decisions.chosenFloatingIp);
				} else if (oldDropletAction === 'destroy') {
					// Destroying the old droplet automatically detaches all volumes from it.
					await digitalOceanApi.deleteDroplet(floatingIp.droplet.id);
				} else {
					info('Deployment aborted.');
					process.exit(1);
				}
			}
		} else {
			const msg = `The defined Floating IP (${code(decisions.chosenFloatingIp)}) is in region ` +
				`${code(floatingIp.region)}, but the this deployment is for ${code(decisions.chosenRegion)}. ` +
				'How would you like to proceed?';
			decisions.chosenFloatingIp = await chooseFloatingIP(msg, digitalOceanApi, decisions);
		}
	} else {
		const msg = `Your deployment definition does not specify a ${code('droplet.floating_ip')}. ` +
			'How would you like to proceed?';
		decisions.chosenFloatingIp = await chooseFloatingIP(msg, digitalOceanApi, decisions);
	}
};

async function chooseFloatingIP(message, digitalOceanApi, decisions) {
	const {floatingIpAction} = await inquirer.prompt([{
		type: 'list',
		name: 'floatingIpAction',
		message,
		choices: [{
			name: 'Create a new Floating IP',
			value: 'create'
		}, {
			name: 'Choose an existing Floating IP',
			value: 'choose_existing'
		}, {
			name: 'Don\'t use a Floating IP',
			value: 'none'
		}]
	}]);

	if (floatingIpAction === 'create') {
		return digitalOceanApi.createFloatingIP({region: decisions.chosenRegion}).ip;
	} else if (floatingIpAction === 'choose_existing') {
		return await chooseFromExistingFloatingIPs(digitalOceanApi, decisions);
	}

	decisions.useFloatingIp = false;
	return null;
}

async function chooseFromExistingFloatingIPs(digitalOceanApi, decisions) {
	let availableFloatingIPs = await digitalOceanApi.listFloatingIPs();
	availableFloatingIPs = availableFloatingIPs.filter(floatingIp => {
		return floatingIp.region.slug === decisions.chosenRegion;
	});

	if (availableFloatingIPs.length <= 0) {
		// Tell the user that they have no path forward and abort.
		error(`You opted to use an existing Floating IP, but you have none in region ${code(decisions.chosenRegion)}!`);
		process.exit(1);
	}

	return await inquirer.prompt([{
		type: 'list',
		name: 'floatingIp',
		message: 'Please choose a Floating IP to use for this deployment',
		choices: availableFloatingIPs.map(floatingIp => {
			const assignedDroplet = floatingIp.droplet;
			const name = assignedDroplet ?
				`${floatingIp.ip} (Currently assigned to ${param(assignedDroplet.name)})` :
				floatingIp.ip;
			return {
				name,
				value: floatingIp.ip
			};
		})
	}]).then(answers => {
		return answers.floatingIp;
	});
}
