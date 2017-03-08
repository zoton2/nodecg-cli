'use strict';

const DROPLET_USERNAME = 'nodecg';
const NODECG_DIR = `/home/${DROPLET_USERNAME}/nodecg`;
const BUNDLES_DIR = `${NODECG_DIR}/bundles`;

const fs = require('fs');
const Mustache = require('mustache');
const getNodecgTarballUrl = require('../get-nodecg-tarball-url');
const CloudConfig = require('../cloud-config');

// Don't escape anything when rendering Mustache templates.
Mustache.escapeHtml = text => text;
Mustache.escape = text => text;

module.exports = async function ({deploymentDefinition, decisions, credentials}) {
	const cloudConfig = new CloudConfig('templates/cloud-config.yml');

	cloudConfig.addSshKey(DROPLET_USERNAME, credentials.publickey);
	cloudConfig.addSshKey(DROPLET_USERNAME, credentials.keypair.ssh); // Only used during setup, then deleted from authorized_keys.

	let mountPath;
	const formatAndMountVolumeScript = fs.readFileSync('templates/format-and-mount-volume.sh', 'utf-8');
	if (decisions.useBlockStorage) {
		mountPath = `/mnt/${decisions.chosenVolume.name}`;
		cloudConfig.addWriteFile({
			owner: 'root:root',
			path: '/root/format-and-mount-volume.sh',
			permissions: '0744',
			content: Mustache.render(formatAndMountVolumeScript, {
				mountPath,
				volumeName: decisions.chosenVolume.name
			})
		});

		cloudConfig.addCommand('/root/format-and-mount-volume.sh');
	}

	if (deploymentDefinition.nodecg.config) {
		cloudConfig.addWriteFile({
			path: `${NODECG_DIR}/cfg/nodecg.json`,
			content: deploymentDefinition.nodecg.config
		});
	}

	cloudConfig.replace('{{email}}', deploymentDefinition.email);

	const nginxSiteTemplate = deploymentDefinition.secure ?
		fs.readFileSync('templates/nginx-site-secure.mst', 'utf-8') :
		fs.readFileSync('templates/nginx-site-insecure.mst', 'utf-8');

	// TODO: look into NodeCG's own `secure` setting
	cloudConfig.addWriteFile({
		owner: 'root:root',
		path: '/etc/nginx/sites-available/nodecg',
		content: Mustache.render(nginxSiteTemplate, {
			domain: deploymentDefinition.domain,
			port: deploymentDefinition.nodecg.config.port
		})
	});

	if (deploymentDefinition.secure) {
		// Symlink /etc/letsencrypt to ${mountPath}/letsencrypt.
		if (decisions.useBlockStorage) {
			const volumeLetsEncryptPath = `${mountPath}/letsencrypt`;
			cloudConfig.addCommand(`mkdir -p ${volumeLetsEncryptPath}`);
			cloudConfig.addCommand(`ln -sf ${volumeLetsEncryptPath} /etc/letsencrypt`);
		}

		cloudConfig.addWriteFile({
			owner: 'root:root',
			path: '/etc/cron.d/letsencrypt_auto_renew',
			content: fs.readFileSync('templates/letsencrypt-cronjob', 'utf-8')
		});

		cloudConfig.addPackage('letsencrypt');

		// TODO: only do this if we don't yet have an active cert
		const letsEncryptCommand = [
			'letsencrypt certonly --standalone --non-interactive --agree-tos',
			`--email ${deploymentDefinition.email}`,
			`-d ${deploymentDefinition.domain}`
		];

		// If debug is true, just ask for a test certificate, which won't
		// count against Let's Encrypt rate limits.
		if (deploymentDefinition.debug) {
			letsEncryptCommand.push('--staging');
		}

		cloudConfig.addCommand('service nginx stop');
		cloudConfig.addCommand(letsEncryptCommand.join(' '));
		cloudConfig.addCommand('service nginx start');
	}

	await getNodecgTarballUrl(deploymentDefinition.nodecg.version).then(nodecgTarballUrl => {
		cloudConfig.addDownload(nodecgTarballUrl, {
			dest: `/home/${DROPLET_USERNAME}/nodecg.tar.gz`,
			untar: true,
			stripComponents: 1,
			cmdPosition: 0,
			curlOpts: '-L',
			extractTo: NODECG_DIR
		});

		if (decisions.useBlockStorage) {
			cloudConfig.addCommand(`mkdir -p ${mountPath}/nodecg/db ${mountPath}/nodecg/assets ${mountPath}/nodecg/logs`);
			cloudConfig.addCommand(`rm -rf /home/${DROPLET_USERNAME}/nodecg/db`);
			cloudConfig.addCommand(`rm -rf /home/${DROPLET_USERNAME}/nodecg/assets`);
			cloudConfig.addCommand(`rm -rf /home/${DROPLET_USERNAME}/nodecg/logs`);
			cloudConfig.addCommand(`ln -sf ${mountPath}/nodecg/db /home/${DROPLET_USERNAME}/nodecg/db`);
			cloudConfig.addCommand(`ln -sf ${mountPath}/nodecg/assets /home/${DROPLET_USERNAME}/nodecg/assets`);
			cloudConfig.addCommand(`ln -sf ${mountPath}/nodecg/logs /home/${DROPLET_USERNAME}/nodecg/logs`);
		}

		deploymentDefinition.bundles.forEach(bundle => {
			cloudConfig.addCommand(`mkdir -p ${BUNDLES_DIR}/${bundle.name}`);

			const downloadOpts = {
				dest: `${BUNDLES_DIR}/${bundle.name}.tar.gz`,
				untar: true,
				stripComponents: 1,
				extractTo: `${BUNDLES_DIR}/${bundle.name}`
			};

			if (bundle.hostedGitInfo.type === 'bitbucket') {
				downloadOpts.auth = {
					username: credentials.bitbucket.username,
					password: credentials.bitbucket.password
				};
			} else if (bundle.hostedGitInfo.type === 'github') {
				downloadOpts.auth = {
					username: credentials.github.username,
					password: credentials.github.token
				};
				downloadOpts.curlOpts = '-L';
			}

			cloudConfig.addDownload(bundle.downloadUrl, downloadOpts);

			if (bundle.config) {
				cloudConfig.addWriteFile({
					path: `${NODECG_DIR}/cfg/${bundle.name}.json`,
					content: bundle.config
				});
			}
		});
	});

	// Install NodeCG's npm and bower dependencies
	const installNodeCGDepdenciesScript = fs.readFileSync('templates/install-nodecg-dependencies.sh', 'utf-8');
	cloudConfig.addWriteFile({
		owner: 'root:root',
		path: '/root/install-nodecg-dependencies.sh',
		permissions: '0744',
		content: Mustache.render(installNodeCGDepdenciesScript, {
			nodejs_version: deploymentDefinition.nodejs_version // eslint-disable-line camelcase
		})
	});

	cloudConfig.addCommand('/root/install-nodecg-dependencies.sh');

	// Transfer ownership of these newly-downloaded files to the nodecg user
	cloudConfig.addCommand(`chown -R ${DROPLET_USERNAME}:${DROPLET_USERNAME} /home/${DROPLET_USERNAME}/`);

	if (decisions.useBlockStorage) {
		cloudConfig.addCommand(`chown -R ${DROPLET_USERNAME}:${DROPLET_USERNAME} ${mountPath}`);
	}

	// Start pm2
	cloudConfig.addCommand(`su - ${DROPLET_USERNAME} -c 'pm2 start /home/${DROPLET_USERNAME}/nodecg/index.js --name=nodecg'`);

	// Restart nginx
	cloudConfig.addCommand('service nginx restart');

	return cloudConfig;
};
