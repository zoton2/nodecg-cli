'use strict';

const yaml = require('js-yaml');
const path = require('path');
const fs = require('fs');
const inquirer = require('inquirer');
const listify = require('listify');
const param = require('../utils/output/param');

module.exports = async function ({deploymentDefinition, decisions, definitionPath}) {
	const deploymentChanges = [];
	if (decisions.chosenRegion !== deploymentDefinition.droplet.region) {
		deploymentChanges.push('region');
	}

	if (decisions.chosenVolume.id !== deploymentDefinition.volume.id) {
		deploymentChanges.push('volume');
	}

	if (decisions.chosenFloatingIp !== deploymentDefinition.droplet.floating_ip) {
		deploymentChanges.push('floating_ip');
	}

	if (deploymentChanges.length > 0) {
		const {saveChanges} = await inquirer.prompt([{
			type: 'confirm',
			name: 'saveChanges',
			message: `You've changed the ${listify(deploymentChanges.map(word => param(word)))} of this deployment. ` +
			`Would you like to save these changes back to ${param(deploymentDefinition.filePath)}?`
		}]);

		if (saveChanges) {
			// write to disk
			const ext = path.parse(definitionPath).ext;
			const file = fs.readFileSync(definitionPath, 'utf-8');
			let rawDefinition;

			if (ext === '.yml' || ext === '.yaml') {
				rawDefinition = yaml.safeLoad(file);
			} else if (ext === '.json') {
				rawDefinition = JSON.parse(file);
			}

			if (deploymentChanges.includes('region')) {
				rawDefinition.droplet.region = decisions.chosenRegion;
			}

			if (deploymentChanges.includes('volume')) {
				rawDefinition.volume.id = decisions.chosenVolume.id;
				rawDefinition.volume.name = decisions.chosenVolume.name;
			}

			if (deploymentChanges.includes('floating_ip')) {
				rawDefinition.droplet.floating_ip = decisions.chosenFloatingIp; // eslint-disable-line camelcase
			}

			if (ext === '.yml' || ext === '.yaml') {
				fs.writeFileSync(deploymentDefinition.filePath, yaml.safeDump(rawDefinition), 'utf-8');
			} else if (ext === '.json') {
				fs.writeFileSync(deploymentDefinition.filePath, JSON.stringify(rawDefinition, null, 2), 'utf-8');
			}
		}
	}
};
