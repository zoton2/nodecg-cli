"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const fs_1 = tslib_1.__importDefault(require("fs"));
const util_1 = require("util");
const chalk_1 = tslib_1.__importDefault(require("chalk"));
const os_1 = tslib_1.__importDefault(require("os"));
const child_process_1 = require("child_process");
const util_2 = tslib_1.__importDefault(require("./util"));
/**
 * Installs npm and bower dependencies for the NodeCG bundle present at the given path.
 * @param bundlePath - The path of the NodeCG bundle to install dependencies for.
 * @param installDev - Whether to install devDependencies.
 */
function default_1(bundlePath, installDev = false) {
    if (!util_2.default.isBundleFolder(bundlePath)) {
        console.error(chalk_1.default.red('Error:') +
            " There doesn't seem to be a valid NodeCG bundle in this folder:" +
            '\n\t' +
            chalk_1.default.magenta(bundlePath));
        process.exit(1);
    }
    let cmdline;
    const cachedCwd = process.cwd();
    if (fs_1.default.existsSync(bundlePath + '/package.json')) {
        process.chdir(bundlePath);
        cmdline = installDev ? 'npm install' : 'npm install --production';
        process.stdout.write(util_1.format('Installing npm dependencies (dev: %s)... ', installDev));
        try {
            child_process_1.execSync(cmdline, {
                cwd: bundlePath,
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            process.stdout.write(chalk_1.default.green('done!') + os_1.default.EOL);
        }
        catch (e) {
            /* istanbul ignore next */
            process.stdout.write(chalk_1.default.red('failed!') + os_1.default.EOL);
            /* istanbul ignore next */
            console.error(e.stack);
            /* istanbul ignore next */
            return;
        }
        process.chdir(cachedCwd);
    }
    if (fs_1.default.existsSync(bundlePath + '/bower.json')) {
        cmdline = util_1.format('bower install %s', installDev ? '' : '--production');
        process.stdout.write(util_1.format('Installing bower dependencies (dev: %s)... ', installDev));
        try {
            child_process_1.execSync(cmdline, {
                cwd: bundlePath,
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            process.stdout.write(chalk_1.default.green('done!') + os_1.default.EOL);
        }
        catch (e) {
            /* istanbul ignore next */
            process.stdout.write(chalk_1.default.red('failed!') + os_1.default.EOL);
            /* istanbul ignore next */
            console.error(e.stack);
        }
    }
}
exports.default = default_1;
