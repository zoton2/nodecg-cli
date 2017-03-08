'use strict';

// Native
const fs = require('fs');
const path = require('path');

// Packages
const defaults = require('json-schema-defaults');
const extend = require('extend');
const hostedGitInfo = require('hosted-git-info');
const randomstring = require('randomstring');
const validator = require('is-my-json-valid');
const yaml = require('js-yaml');

// Ours
const code = require('../utils/output/code');
const error = require('../utils/output/error');
const param = require('../utils/output/param');

const SCHEMA_PATH = path.resolve(__dirname, '../../schemas/deployment.yml');

module.exports = function (filePath) {
	const schema = yaml.safeLoad(fs.readFileSync(SCHEMA_PATH));
	const ext = path.parse(filePath).ext;
	let parsedDefinition;
	let file;

	try {
		file = fs.readFileSync(filePath, 'utf-8');
	} catch (e) {
		error(`Failed to read deployment definition file ${param(filePath)}`);
		error(e.message);
		process.exit(1);
	}

	if (ext === '.yml' || ext === '.yaml') {
		try {
			parsedDefinition = yaml.safeLoad(file);
		} catch (e) {
			error(`Failed to parse deployment definition file ${param(filePath)}`);
			error(`Please ensure that it is valid YAML.`);
			error(e.message);
			process.exit(1);
		}
	} else if (ext === '.json') {
		try {
			parsedDefinition = JSON.parse(file);
		} catch (e) {
			error(`Failed to parse deployment definition file ${param(filePath)}`);
			error(`Please ensure that it is valid JSON.`);
			error(e.message);
			process.exit(1);
		}
	} else {
		error(`Unsupported deployment definition file type: ${param(ext)}`);
		error(`Please provide either a ${code('JSON')} or ${code('YAML')} file.`);
		process.exit(1);
	}

	schema.properties.nodecg.properties.config.properties.login.properties.sessionSecret.default = randomstring.generate();
	schema.properties.nodecg.properties.config.properties.baseURL.default = parsedDefinition.domain;

	// These properties are required for the way we configure letsencrypt on secure deployments.
	if (parsedDefinition.secure) {
		schema.properties.domain.required = true;
		schema.properties.email.required = true;
		schema.properties.nodecg.properties.config.properties.login.properties.forceHttpsReturn.default = true;
	}

	const defaultDefinition = defaults(schema);
	parsedDefinition = extend(true, defaultDefinition, parsedDefinition);

	const validate = validator(schema, {greedy: true, verbose: true});
	const result = validate(parsedDefinition);
	if (!result) {
		let errorMessage = `${param(filePath)} is invalid:\n`;
		const errors = validate.errors;
		errors.forEach(error => {
			const field = error.field.replace('data.', '');
			errorMessage += `\t${code(field)} ${error.message}\n`;
			errorMessage += `\tvalue: ${error.value}\n\ttype: ${error.type}\n`;
		});
		error(errorMessage);
		process.exit(1);
	}

	parsedDefinition.filePath = filePath;
	const parsedBundles = [];

	for (const bundleName in parsedDefinition.bundles) {
		if (!{}.hasOwnProperty.call(parsedDefinition.bundles, bundleName)) {
			continue;
		}

		const bundle = parsedDefinition.bundles[bundleName];
		bundle.name = bundleName;
		bundle.hostedGitInfo = hostedGitInfo.fromUrl(bundle.url);
		parsedBundles.push(bundle);
	}

	parsedDefinition.bundles = parsedBundles;
	return parsedDefinition;
};
