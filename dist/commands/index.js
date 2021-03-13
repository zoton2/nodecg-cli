"use strict";
/**
 * Command loader copied from Tim Santeford's commander.js starter
 * https://github.com/tsantef/commander-starter
 */
const tslib_1 = require("tslib");
const fs_1 = tslib_1.__importDefault(require("fs"));
const path_1 = tslib_1.__importDefault(require("path"));
module.exports = function (program) {
    const commands = {};
    const loadPath = path_1.default.dirname(__filename);
    // Loop though command files
    fs_1.default.readdirSync(loadPath)
        .filter((filename) => {
        return filename.endsWith('.js') && filename !== 'index.js';
    })
        .forEach((filename) => {
        const name = filename.substr(0, filename.lastIndexOf('.'));
        // Require command
        const command = require(path_1.default.join(loadPath, filename));
        // Initialize command
        commands[name] = command(program);
    });
    return commands;
};
