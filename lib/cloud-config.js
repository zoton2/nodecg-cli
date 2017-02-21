/* eslint-disable camelcase */

// Native
const fs = require('fs');
const path = require('path');

// Packages
const yaml = require('js-yaml');

module.exports = class {
	constructor(templateFilePath) {
		this.json = {};

		if (templateFilePath) {
			const doc = yaml.safeLoad(fs.readFileSync('templates/cloud-config.yml', 'utf8'));
			Object.assign(this.json, doc);
		}
	}

	dump() {
		this.json.write_files = this.json.write_files.slice(2); // TODO: delete this
		return `#cloud-config\n${yaml.safeDump(this.json, {lineWidth: 2058})}`;
	}

	addDownload(url, {dest, auth = {}, unpack = false, deleteAfterUnzip = true}) {
		let str = 'curl';

		if (auth.username && auth.password) {
			str += ` -u ${auth.username}:${auth.password}`;
		}

		str += ` -o ${dest} ${url}`;

		if (unpack) {
			const dirname = path.parse(dest).dir;
			str += ` && aunpack --extract-to=${dirname} ${dest}`;
		}

		if (deleteAfterUnzip) {
			str += ` && rm ${dest}`;
		}

		this.addCommand(str);
	}

	addCommand(commandString) {
		if (!this.json.runcmd) {
			this.json.runcmd = [];
		}

		this.json.runcmd.push(commandString);
	}

	addUser(username) {
		if (!this.json.users) {
			this.json.users = [];
		}

		const existingUser = this.json.users.find(user => user.name === username);
		if (existingUser) {
			throw new Error(`A user with that name ("${username}") already exists.`);
		}

		const newUser = {name: username};
		this.json.users.push(newUser);
		return newUser;
	}

	addSshKey(username, publicKey) {
		let user = this.json.users.find(user => user.name === username);

		if (!user) {
			user = this.addUser(username);
		}

		if (!user['ssh-authorized-keys']) {
			user['ssh-authorized-keys'] = [];
		}

		user['ssh-authorized-keys'].push(publicKey);
	}

	// cloudConfig.addTextFile(`${NODECG_DIR}/cfg/${bundle.name}.json`, bundle.config);
	addWriteFile(path, content, {owner, permissions, encoding} = {}) {
		if (!this.json.write_files) {
			this.json.write_files = [];
		}

		const writeFileDirective = {
			path,
			content: JSON.stringify(content)
		};

		if (owner) {
			writeFileDirective.owner = owner;
		}

		if (permissions) {
			writeFileDirective.permissions = permissions;
		}

		if (encoding) {
			writeFileDirective.encoding = encoding;
		}

		this.json.write_files.push(writeFileDirective);
	}

	replace(target, replacement) {
		const regex = new RegExp(target, 'g');
		const stringified = JSON.stringify(this.json);
		this.json = JSON.parse(stringified.replace(regex, replacement));
	}
};
