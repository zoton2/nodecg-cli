'use strict';

const chalk = require('chalk');
const wait = require('../utils/output/wait');

// TODO: catch errors when a volume with this name already exists
module.exports = async function ({decisions, ssh}) {
	const stopMountVolumeSpinner = wait(`Mount volume "${decisions.chosenVolume.name}" on droplet`);
	const mountPath = `/mnt/${decisions.chosenVolume.name}`;
	const devicePath = `/dev/disk/by-uuid/${decisions.chosenVolume.id}`;

	// Create a mount point under /mnt
	// sudo mkdir -p /mnt/volume-nyc1-01
	await ssh.execCommand(`sudo mkdir -p ${mountPath}`);

	// Check if the volume is formatted yet
	// will return "/dev/disk/by-id/scsi-0DO_Volume_division: data" when not formatted
	const fileResult = await ssh.execCommand(`sudo file -sL ${devicePath}`);
	if (fileResult === `${devicePath}: data`) {
		// Format the volume, if necessary
		ssh.execCommand(`sudo mkfs.ext4 -F ${devicePath}`);
	}

	// Mount the volume
	ssh.execCommand(`sudo mount -o discard,defaults ${devicePath} ${mountPath}`);

	// Change fstab so the volume will be mounted after a reboot
	// echo '/dev/disk/by-id/scsi-0DO_Volume_volume-nyc1-01 /mnt/volume-nyc1-01 ext4 defaults,nofail,discard 0 0' | sudo tee -a /etc/fstab
	ssh.execCommand(`echo '${devicePath} ${mountPath} ext4 defaults,nofail,discard 0 0' | sudo tee -a /etc/fstab`);

	stopMountVolumeSpinner();
	process.stdout.write(`${chalk.cyan('✓')} Mount volume "${decisions.chosenVolume.name}" on droplet\n`);
};
