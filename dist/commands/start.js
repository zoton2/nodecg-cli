"use strict";
const tslib_1 = require("tslib");
const util_1 = tslib_1.__importDefault(require("../lib/util"));
module.exports = function (program) {
    program
        .command('start')
        .description('Start NodeCG')
        .action(() => {
        // Check if nodecg is already installed
        if (util_1.default.pathContainsNodeCG(process.cwd())) {
            require(process.cwd());
        }
        else {
            console.warn('No NodeCG installation found in this folder.');
        }
    });
};
