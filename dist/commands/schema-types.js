"use strict";
const tslib_1 = require("tslib");
// Native
const fs_1 = tslib_1.__importDefault(require("fs"));
const path_1 = tslib_1.__importDefault(require("path"));
const util_1 = require("util");
// Packages
const chalk_1 = tslib_1.__importDefault(require("chalk"));
const fs_extra_1 = tslib_1.__importDefault(require("fs-extra"));
const json_schema_to_typescript_1 = require("json-schema-to-typescript");
const writeFilePromise = util_1.promisify(fs_1.default.writeFile);
function action(inDir, cmd) {
    const processCwd = process.cwd();
    const schemasDir = path_1.default.resolve(processCwd, inDir || 'schemas');
    if (!fs_1.default.existsSync(schemasDir)) {
        console.error(chalk_1.default.red('Error:') + ' Input directory ("%s") does not exist', inDir);
        return;
    }
    const outDir = path_1.default.resolve(processCwd, cmd.outDir);
    if (!fs_1.default.existsSync(outDir)) {
        fs_extra_1.default.mkdirpSync(outDir);
    }
    const configSchemaPath = path_1.default.join(processCwd, 'configschema.json');
    const schemas = fs_1.default.readdirSync(schemasDir).filter((f) => f.endsWith('.json'));
    const style = {
        singleQuote: true,
        useTabs: true,
    };
    const compilePromises = [];
    const compile = (input, output, cwd = processCwd) => {
        const promise = json_schema_to_typescript_1.compileFromFile(input, {
            cwd,
            declareExternallyReferenced: true,
            enableConstEnums: true,
            style,
        })
            .then((ts) => writeFilePromise(output, ts))
            .then(() => {
            console.log(output);
        })
            .catch((err) => {
            console.error(err);
        });
        compilePromises.push(promise);
        return promise;
    };
    const indexFiles = [];
    if (fs_1.default.existsSync(configSchemaPath) && cmd.configSchema) {
        compile(configSchemaPath, path_1.default.resolve(outDir, 'configschema.d.ts'));
        indexFiles.push(`export * from './configschema';`);
    }
    for (const schema of schemas) {
        indexFiles.push(`export * from './${schema.replace(/\.json$/i, '')}';`);
        compile(path_1.default.resolve(schemasDir, schema), path_1.default.resolve(outDir, schema.replace(/\.json$/i, '.d.ts')), schemasDir);
    }
    const indexPromise = writeFilePromise(path_1.default.resolve(outDir, 'index.d.ts'), `${indexFiles.join('\n')}\n`);
    return Promise.all([indexPromise, ...compilePromises]).then(() => {
        process.emit('schema-types-done');
    });
}
module.exports = function (program) {
    program
        .command('schema-types [dir]')
        .option('-o, --out-dir [path]', 'Where to put the generated d.ts files', 'src/types/schemas')
        .option('--no-config-schema', "Don't generate a typedef from configschema.json")
        .description('Generate d.ts TypeScript typedef files from Replicant schemas and configschema.json (if present)')
        .action(action);
};
