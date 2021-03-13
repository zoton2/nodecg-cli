"use strict";
const tslib_1 = require("tslib");
const util_1 = tslib_1.__importDefault(require("../lib/util"));
const chalk_1 = tslib_1.__importDefault(require("chalk"));
const fs_1 = tslib_1.__importDefault(require("fs"));
const path_1 = tslib_1.__importDefault(require("path"));
const json_schema_defaults_1 = tslib_1.__importDefault(require("json-schema-defaults"));
function action(bundleName) {
    const cwd = process.cwd();
    const nodecgPath = util_1.default.getNodeCGPath();
    if (!bundleName) {
        if (util_1.default.isBundleFolder(cwd)) {
            bundleName = bundleName !== null && bundleName !== void 0 ? bundleName : path_1.default.basename(cwd);
        }
        else {
            console.error(chalk_1.default.red('Error:') + ' No bundle found in the current directory!');
            return;
        }
    }
    const bundlePath = path_1.default.join(nodecgPath, 'bundles/', bundleName);
    const schemaPath = path_1.default.join(nodecgPath, 'bundles/', bundleName, '/configschema.json');
    const cfgPath = path_1.default.join(nodecgPath, 'cfg/');
    if (!fs_1.default.existsSync(bundlePath)) {
        console.error(chalk_1.default.red('Error:') + ' Bundle %s does not exist', bundleName);
        return;
    }
    if (!fs_1.default.existsSync(schemaPath)) {
        console.error(chalk_1.default.red('Error:') + ' Bundle %s does not have a configschema.json', bundleName);
        return;
    }
    if (!fs_1.default.existsSync(cfgPath)) {
        fs_1.default.mkdirSync(cfgPath);
    }
    const schema = JSON.parse(fs_1.default.readFileSync(schemaPath, 'utf8'));
    const configPath = path_1.default.join(nodecgPath, 'cfg/', bundleName + '.json');
    if (fs_1.default.existsSync(configPath)) {
        console.error(chalk_1.default.red('Error:') + ' Bundle %s already has a config file', bundleName);
    }
    else {
        try {
            fs_1.default.writeFileSync(configPath, JSON.stringify(json_schema_defaults_1.default(schema), null, '  '));
            console.log(chalk_1.default.green('Success:') +
                " Created %s's default config from schema\n\n" +
                JSON.stringify(json_schema_defaults_1.default(schema), null, '  '), bundleName);
        }
        catch (e) {
            console.error(chalk_1.default.red('Error: ') + String(e));
        }
    }
}
module.exports = function (program) {
    program
        .command('defaultconfig [bundle]')
        .description('Generate default config from configschema.json')
        .action(action);
};
