const yaml = require('js-yaml');
const fs = require('fs');

module.exports = class {
	constructor(templateFilePath) {
		this.json = {};

		if (templateFilePath) {
			const doc = yaml.safeLoad(fs.readFileSync('templates/cloud-config.yml', 'utf8'));
			Object.assign(this.json, doc);
		}
	}

	dump() {
		return yaml.safeDump(this.json, {lineWidth: 256});
	}

	addDownload(url, {dest, auth, unzip = false, deleteAfterUnzip = true}) {
		let str = 'curl';

		if (auth.username && auth.password) {
			str += ` -u ${auth.username}:${auth.password}`;
		}

		str += ` -o ${dest} ${url}`;

		if (unzip) {
			str += ` && unzip ${dest}`;
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
		if (!this.users) {
			this.users = [];
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

		if (!user['ssh-suthorized-keys']) {
			user['ssh-suthorized-keys'] = [];
		}

		user['ssh-suthorized-keys'].push(publicKey);
	}
};
