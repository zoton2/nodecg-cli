'use strict';

const util = require('../lib/utils/nodecg');

module.exports = function (program) {
	program.command('start')
		.description('Start NodeCG')
		.action(() => {
			// Check if nodecg is already installed
			if (util.pathContainsNodeCG(process.cwd())) {
				require(process.cwd());
			} else {
				console.warn('No NodeCG installation found in this folder.');
			}
		});
};
