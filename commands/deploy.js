'use strict';

// TODO: rewrite to use got instead of request

// Packages
const chalk = require('chalk');
const DigitalOcean = require('digitalocean-v2');
const escapeStringRegexp = require('escape-string-regexp');
const GitHubApi = require('github');

// Ours
const error = require('../lib/utils/output/error');
const genreateKeypair = require('../lib/generateKeypair');
const param = require('../lib/utils/output/param');
const success = require('../lib/utils/output/success');
const wait = require('../lib/utils/output/wait');

// Script Parts
const parseDeploymentDefinition = require('../lib/deploy/parse-deployment-definition');
const gatherNeededCredentials = require('../lib/deploy/gather-needed-credentials');
const gatherDownloadUrls = require('../lib/deploy/gather-download-urls');
const generateCloudConfig = require('../lib/deploy/generate-cloud-config');
const chooseRegion = require('../lib/deploy/region.js');
const chooseFloatingIp = require('../lib/deploy/floating-ip.js');
const waitUntilDomainResolvesToFloatingIp = require('../lib/deploy/wait-until-domain-resolves-to-floating-ip');
const chooseVolume = require('../lib/deploy/volume.js');
const saveDeploymentChanges = require('../lib/deploy/save-deployment-changes');
const createDroplet = require('../lib/deploy/create-droplet.js');
const sshToDroplet = require('../lib/deploy/ssh-to-droplet.js');
const waitForCloudInit = require('../lib/deploy/wait-for-cloud-init.js');

const github = new GitHubApi();

module.exports = function (program) {
	program.command('deploy <filePath>')
		.description('Deploys the given NodeCG instance to DigitalOcean')
		.action(function () {
			return action.apply(action, arguments).catch(e => {
				if (e) {
					error(e);
				}

				process.exit(1);
			});
		});
};

async function action(filePath) {
	// TODO: json schema with defaults
	let deploymentDefinition = parseDeploymentDefinition(filePath);

	const credentials = await gatherNeededCredentials({deploymentDefinition, github});
	const digitalOceanApi = new DigitalOcean(credentials.digitalocean);

	const stopGatherDownloadUrlsSpinner = wait('Gather download URLs for NodeCG and bundles');
	deploymentDefinition = await gatherDownloadUrls({deploymentDefinition, credentials, github});
	stopGatherDownloadUrlsSpinner();
	process.stdout.write(`${chalk.cyan('✓')} Gather download URLs for NodeCG and bundles\n`);

	const stopGenerateKeypairSpinner = wait('Generate keypair (will be discarded after initial setup)');
	credentials.keypair = genreateKeypair();
	stopGenerateKeypairSpinner();
	process.stdout.write(`${chalk.cyan('✓')} Generate keypair (will be discarded after initial setup)\n`);

	const decisions = {
		useBlockStorage: true,
		useFloatingIp: true,
		chosenRegion: deploymentDefinition.droplet.region,
		chosenFloatingIp: deploymentDefinition.droplet.floating_ip,
		chosenVolume: {id: deploymentDefinition.volume.id},
		droplet: null
	};

	// Changes useBlockStorage and chosenRegion (because not every region supports block storage)
	await chooseRegion({deploymentDefinition, digitalOceanApi, decisions});

	/* At this point, we don't allow any more region changes.
	 * If we encounter something that requires changing region to continue, we abort.
	 */

	// Changes useFloatingIp and chosenFloatingIp.
	try {
		await chooseFloatingIp({digitalOceanApi, decisions});
	} catch (e) {
		error(`Failed to decide on a Floating IP:\n\t${e}`);
		process.exit(1);
	}

	if (decisions.useFloatingIp) {
		await waitUntilDomainResolvesToFloatingIp({
			deploymentDefinition, decisions
		});
	}

	if (decisions.useBlockStorage) {
		// Changes chosenVolume
		if (deploymentDefinition.volume.id) {
			const result = await digitalOceanApi.getVolume(deploymentDefinition.volume.id);
			if (result.region.slug !== decisions.chosenRegion) {
				await chooseVolume({
					msg: `Volume ${param(decisions.chosenVolume.id)} is in region ${param(result.region.slug)}, ` +
						`but this deployment is for ${param(decisions.chosenRegion)}.`,
					deploymentDefinition,
					digitalOceanApi,
					decisions
				});
			} else if (result.id) {
				decisions.chosenVolume = result;
			} else {
				await chooseVolume({
					msg: `Volume ${param(decisions.chosenVolume.id)} does not exist.`,
					deploymentDefinition,
					digitalOceanApi,
					decisions
				});
			}
		} else if (deploymentDefinition.volume.name) {
			const volumesWithName = await digitalOceanApi.getVolumeByName(
				deploymentDefinition.volume.name, decisions.chosenRegion
			);

			if (volumesWithName.length === 0) {
				await chooseVolume({
					msg: `No volumes with the name ${param(deploymentDefinition.volume.name)} could be found ` +
						`in ${param(decisions.chosenRegion)}.`,
					deploymentDefinition,
					digitalOceanApi,
					decisions
				});
			} else if (volumesWithName.length === 1) {
				decisions.chosenVolume = volumesWithName[0];
			} else {
				// todo: choose which of these to go with
			}
		} else {
			await chooseVolume({deploymentDefinition, digitalOceanApi, decisions});
		}
	}

	// TODO: prompt to destroy any existing droplets with same name

	try {
		await saveDeploymentChanges({deploymentDefinition, decisions, definitionPath: filePath});
	} catch (e) {
		error(`Failed to save deployment changes back to disk:\n\t${e}`);
		process.exit(1);
	}

	const stopGenerateCloudConfigSpinner = wait('Generate cloud-init script');
	const cloudConfig = await generateCloudConfig({deploymentDefinition, credentials, decisions});
	stopGenerateCloudConfigSpinner();
	process.stdout.write(`${chalk.cyan('✓')} Generate cloud-init script\n`);

	decisions.droplet = await createDroplet({
		deploymentDefinition, digitalOceanApi, cloudConfig, decisions, credentials
	});

	if (decisions.useFloatingIp) {
		const stopAssignFloatingIPSpinner = wait('Assign Floating IP to droplet');
		await digitalOceanApi.assignFloatingIP(decisions.chosenFloatingIp, decisions.droplet.id);
		stopAssignFloatingIPSpinner();
		process.stdout.write(`${chalk.cyan('✓')} Assign Floating IP to droplet\n`);
	}

	const ssh = await sshToDroplet({decisions, credentials});

	await waitForCloudInit({ssh});

	// Remove our setup key from authorized_keys
	const stopRemoveSetupKeySpinner = wait('Remove setup key from authorized_keys');
	const removeSetupKeyResult = await ssh.execCommand(
		`sed -i -e '/${escapeStringRegexp(credentials.keypair.ssh.slice(-18).slice(2, 16))}/d' /home/nodecg/.ssh/authorized_keys`
	);
	stopRemoveSetupKeySpinner();

	if (removeSetupKeyResult.stderr) {
		process.stdout.write(`${chalk.red('✗')} Remove setup key from authorized_keys\n`);
		error(removeSetupKeyResult.stderr);
		process.exit(1);
	} else {
		process.stdout.write(`${chalk.cyan('✓')} Remove setup key from authorized_keys\n`);
		success('NodeCG deployed!');
		process.exit(0);
	}
}
