#!/usr/bin/env bash

MOUNT_PATH={{mountPath}}
DEVICE_PATH=$(find /dev/disk/by-id -maxdepth 1 -name '*{{volumeName}}*' -print -quit)
echo "DEVICE_PATH=$DEVICE_PATH"

# Format the volume, if necessary
# will return "/dev/disk/by-id/$DISK_ID: data" when not formatted
if [[ $(file -sL $DEVICE_PATH) == "$DEVICE_PATH: data" ]]; then
	mkfs.ext4 -F $DEVICE_PATH
fi

# Create a mount point under /mnt
mkdir -p $MOUNT_PATH

# Mount the volume
mount -o discard,defaults $DEVICE_PATH $MOUNT_PATH

# Change fstab so the volume will be mounted after a reboot
echo "$DEVICE_PATH $MOUNT_PATH ext4 defaults,nofail,discard 0 0" | tee -a /etc/fstab
