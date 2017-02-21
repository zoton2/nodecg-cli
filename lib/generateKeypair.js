'use strict';

const keypair = require('keypair');
const forge = require('node-forge');

module.exports = function () {
	const pair = keypair();
	const publicKey = forge.pki.publicKeyFromPem(pair.public);
	pair.ssh = forge.ssh.publicKeyToOpenSSH(publicKey, `nodecg-cli (${new Date().toISOString()})`);
	return pair;
};

