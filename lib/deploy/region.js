'use strict';

const inquirer = require('inquirer');

module.exports = async function (deploymentDefinition, digitalOceanApi, decisions) {
	// If the datacenter for this deployment definition does not support Block Storage,
	// ask the user if they wish to continue or select another datacenter.
	const regions = await digitalOceanApi.listRegions();
	const chosenRegionSupportsStorage = regions.some(region => {
		return region.slug === decisions.chosenRegion && region.features.includes('storage');
	});

	if (!chosenRegionSupportsStorage) {
		const {changeRegion} = await inquirer.prompt([{
			type: 'confirm',
			name: 'changeRegion',
			message: `Region "${deploymentDefinition.droplet.region}" does not support Block Storage volumes.` +
			'Would you like to change to a region that does?'
		}]);

		if (changeRegion) {
			decisions.chosenRegion = await inquirer.prompt([{
				type: 'list',
				name: 'newRegion',
				message: 'Please select from the regions that support Block Storage',
				choices: regions.filter(region => {
					return region.features.includes('storage');
				}).map(region => {
					return {
						name: `${region.name} (${region.slug})`,
						value: region.slug
					};
				}),
				default: 'nyc1'
			}]).then(({newRegion}) => {
				return newRegion;
			});
		} else {
			decisions.useBlockStorage = false;
		}
	}
};
