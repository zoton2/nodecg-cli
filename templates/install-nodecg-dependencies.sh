#!/usr/bin/env bash

NODEJS_VERSION={{nodejs_version}}

# Make swapfile, which we'll likely need to run `npm install` with running out of RAM.
fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile

# Install npm and bower deps
su - nodecg -c "source ~/.bashrc && nvm install $NODEJS_VERSION &&
echo \"nvm use $NODEJS_VERSION\" >> ~/.bashrc && npm install -g pm2 bower && cd /home/nodecg/nodecg &&
npm install && bower install"

# Turn off swapfile now that we don't need it anymore.
swapoff /swapfile
