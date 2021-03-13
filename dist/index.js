"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
process.title = 'nodecg';
const request_1 = tslib_1.__importDefault(require("request"));
const semver_1 = tslib_1.__importDefault(require("semver"));
const chalk_1 = tslib_1.__importDefault(require("chalk"));
const commander_1 = require("commander");
const program = new commander_1.Command('nodecg');
const packageVersion = require('../package.json').version;
// Check for updates
request_1.default('http://registry.npmjs.org/nodecg-cli/latest', (err, res, body) => {
    if (!err && res.statusCode === 200) {
        if (semver_1.default.gt(JSON.parse(body).version, packageVersion)) {
            console.log(chalk_1.default.yellow('?') +
                ' A new update is available for nodecg-cli: ' +
                chalk_1.default.green.bold(JSON.parse(body).version) +
                chalk_1.default.dim(' (current: ' + packageVersion + ')'));
            console.log('  Run ' + chalk_1.default.cyan.bold('npm install -g nodecg-cli') + ' to install the latest version');
        }
    }
});
// Initialise CLI
program.version(packageVersion).usage('<command> [options]');
// Initialise commands
require('./commands')(program);
// Handle unknown commands
program.on('*', () => {
    console.log('Unknown command:', program.args.join(' '));
    program.help();
});
// Print help if no commands were given
if (!process.argv.slice(2).length) {
    program.help();
}
// Process commands
program.parse(process.argv);
