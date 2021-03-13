"use strict";
const tslib_1 = require("tslib");
const fs_1 = tslib_1.__importDefault(require("fs"));
const inquirer_1 = tslib_1.__importDefault(require("inquirer"));
const path_1 = tslib_1.__importDefault(require("path"));
const util_1 = tslib_1.__importDefault(require("../lib/util"));
const chalk_1 = tslib_1.__importDefault(require("chalk"));
const rimraf_1 = tslib_1.__importDefault(require("rimraf"));
const os_1 = tslib_1.__importDefault(require("os"));
function action(bundleName, options) {
    const nodecgPath = util_1.default.getNodeCGPath();
    const bundlePath = path_1.default.join(nodecgPath, 'bundles/', bundleName);
    if (!fs_1.default.existsSync(bundlePath)) {
        console.error('Cannot uninstall %s: bundle is not installed.', chalk_1.default.magenta(bundleName));
        return;
    }
    /* istanbul ignore if: deleteBundle() is tested in the else path */
    if (options.force) {
        deleteBundle(bundleName, bundlePath);
    }
    else {
        inquirer_1.default
            .prompt([
            {
                name: 'confirmUninstall',
                message: 'Are you sure you wish to uninstall ' + chalk_1.default.magenta(bundleName) + '?',
                type: 'confirm',
            },
        ])
            .then((answers) => {
            if (answers.confirmUninstall) {
                deleteBundle(bundleName, bundlePath);
            }
        });
    }
}
function deleteBundle(name, path) {
    if (!fs_1.default.existsSync(path)) {
        console.log('Nothing to uninstall.');
        return;
    }
    process.stdout.write('Uninstalling ' + chalk_1.default.magenta(name) + '... ');
    try {
        rimraf_1.default.sync(path);
    }
    catch (e) {
        /* istanbul ignore next */
        process.stdout.write(chalk_1.default.red('failed!') + os_1.default.EOL);
        /* istanbul ignore next */
        console.error(e.stack);
        /* istanbul ignore next */
        return;
    }
    process.stdout.write(chalk_1.default.green('done!') + os_1.default.EOL);
}
module.exports = function (program) {
    program
        .command('uninstall <bundle>')
        .description('Uninstalls a bundle.')
        .option('-f, --force', 'ignore warnings')
        .action(action);
};
