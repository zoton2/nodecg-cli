"use strict";
const tslib_1 = require("tslib");
const fs_1 = tslib_1.__importDefault(require("fs"));
const os_1 = tslib_1.__importDefault(require("os"));
const install_bundle_deps_1 = tslib_1.__importDefault(require("../lib/install-bundle-deps"));
const child_process_1 = require("child_process");
const npm_package_arg_1 = tslib_1.__importDefault(require("npm-package-arg"));
const path_1 = tslib_1.__importDefault(require("path"));
const util_1 = tslib_1.__importDefault(require("../lib/util"));
const semver_1 = tslib_1.__importDefault(require("semver"));
const chalk_1 = tslib_1.__importDefault(require("chalk"));
const fetch_tags_1 = tslib_1.__importDefault(require("../lib/fetch-tags"));
function action(repo, options) {
    const dev = options.dev || false;
    // If no args are supplied, assume the user is intending to operate on the bundle in the current dir
    if (!repo) {
        install_bundle_deps_1.default(process.cwd(), dev);
        return;
    }
    let range = '';
    if (repo.indexOf('#') > 0) {
        const repoParts = repo.split('#');
        range = repoParts[1];
        repo = repoParts[0];
    }
    const nodecgPath = util_1.default.getNodeCGPath();
    const parsed = npm_package_arg_1.default(repo);
    if (!parsed.hosted) {
        console.error('Please enter a valid git repository URL or GitHub username/repo pair.');
        return;
    }
    const hostedInfo = parsed.hosted;
    const repoUrl = hostedInfo.git();
    if (!repoUrl) {
        console.error('Please enter a valid git repository URL or GitHub username/repo pair.');
        return;
    }
    // Check that `bundles` exists
    const bundlesPath = path_1.default.join(nodecgPath, 'bundles');
    /* istanbul ignore next: Simple directory creation, not necessary to test */
    if (!fs_1.default.existsSync(bundlesPath)) {
        fs_1.default.mkdirSync(bundlesPath);
    }
    // Extract repo name from git url
    const temp = repoUrl.split('/').pop();
    const bundleName = temp.substr(0, temp.length - 4);
    const bundlePath = path_1.default.join(nodecgPath, 'bundles/', bundleName);
    // Figure out what version to checkout
    process.stdout.write(`Fetching ${bundleName} release list... `);
    let tags;
    let target;
    try {
        tags = fetch_tags_1.default(repoUrl);
        target = semver_1.default.maxSatisfying(tags, range);
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
    // Clone from github
    process.stdout.write(`Installing ${bundleName}... `);
    try {
        child_process_1.execSync(`git clone ${repoUrl} "${bundlePath}"`, { stdio: ['pipe', 'pipe', 'pipe'] });
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
    // If a bundle has no git tags, target will be null.
    if (target) {
        process.stdout.write(`Checking out version ${target}... `);
        try {
            child_process_1.execSync(`git checkout ${target}`, {
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
    }
    // After installing the bundle, install its npm dependencies
    install_bundle_deps_1.default(bundlePath, dev);
}
module.exports = function (program) {
    program
        .command('install [repo]')
        .description('Install a bundle by cloning a git repo. Can be a GitHub owner/repo pair or a git url.' +
        "\n\t\t    If run in a bundle directory with no arguments, installs that bundle's dependencies.")
        .option('-d, --dev', 'install development npm & bower dependencies')
        .action(action);
};
