'use strict';

const error = require('../output/error');

module.exports = async function (digitalOceanApi, dropletId) {
	const result = await digitalOceanApi.deleteDroplet(dropletId);
	if (result.code && result.code !== 204) {
		error(`Failed to delete droplet:\n\t${result}`);
		process.exit(1);
	}
};
