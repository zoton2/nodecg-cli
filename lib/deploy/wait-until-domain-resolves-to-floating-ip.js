'use strict';

const inquirer = require('inquirer');
const Promise = require('bluebird');
const chalk = require('chalk');
const resolve4 = Promise.promisify(require('dns').resolve4);
const code = require('../utils/output/code');
const wait = require('../utils/output/wait');

module.exports = async function ({deploymentDefinition, decisions}) {
	try {
		const ips = await resolve4(deploymentDefinition.domain);
		if (ips[0] === decisions.chosenFloatingIp) {
			// we good
		} else {
			await doTheDangThing(ips[0], deploymentDefinition, decisions);
		}
	} catch (error) {
		if (error.code === 'ENODATA') {
			await doTheDangThing(null, deploymentDefinition, decisions);
		} else {
			error(`Couldn't resolve ${deploymentDefinition.domain}: ${error.code}`);
			process.exit(1);
		}
	}
};

async function doTheDangThing(ip, deploymentDefinition, decisions) {
	const midMsgPart = ip ? `It currently resolves to ${code(ip)}.` : `It currently does not resolve to anything.`;

	const message = `The defined domain (${code(deploymentDefinition.domain)}) does not resolve to the chosen` +
		`Floating IP (${code(decisions.chosenFloatingIp)}). ${midMsgPart} ` +
		`Hit ${code('Enter')} once you've updated the DNS record to point to ${code(decisions.chosenFloatingIp)}.`;

	await inquirer.prompt([{
		type: 'list',
		name: 'fixDNSRecord',
		message,
		choices: ['OK']
	}]);

	const spinnerMsg = `Wait for ${code(deploymentDefinition.domain)} to resolve to ${code(decisions.chosenFloatingIp)}`;
	const stopCheckDnsSpinner = wait(spinnerMsg);

	let keepChecking = true;
	while (keepChecking === true) {
		// Wait two seconds
		await new Promise(resolve => {
			setTimeout(resolve, 2000);
		});

		const ips = await resolve4(deploymentDefinition.domain);
		if (ips[0] === decisions.chosenFloatingIp) {
			keepChecking = false;
		}
	}

	stopCheckDnsSpinner();
	process.stdout.write(`${chalk.cyan('✓')} ${spinnerMsg}\n`);
}
