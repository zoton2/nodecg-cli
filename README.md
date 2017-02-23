# nodecg-cli [![Build Status](https://travis-ci.org/nodecg/nodecg-cli.svg?branch=master)](https://travis-ci.org/nodecg/nodecg-cli) [![Coverage Status](https://coveralls.io/repos/github/nodecg/nodecg-cli/badge.svg?branch=master)](https://coveralls.io/github/nodecg/nodecg-cli?branch=master) [![Greenkeeper badge](https://badges.greenkeeper.io/nodecg/nodecg-cli.svg)](https://greenkeeper.io/)

[NodeCG](https://github.com/nodecg/nodecg)'s command line interface.

## Installation
1. Install [Node.js](https://nodejs.org/en/) v7.6.0 or greater.
2. Make sure you have [git](http://git-scm.com/) installed, and that it is in your PATH.
3. Install [bower](http://bower.io/), which may be used to install bundles' dependencies:

	```sh
	npm install -g bower
	```

4. Install nodecg-cli via npm:

	```sh
	npm install -g nodecg-cli
	````

5. Installing `nodecg-cli` does not install NodeCG itself. To install an instance of NodeCG, use the `setup` command in an empty directory:

	```sh
	mkdir nodecg
	cd nodecg
	nodecg setup
	```

## Usage
* `nodecg setup [version] [--update]`
	* Install a new instance of NodeCG. `version` is a semver range. If `version` is not supplied, the latest release 
	will be installed. Enable `--update` flag to install over an existing copy of NodeCG.
* `nodecg start`
	* Start the NodeCG instance in this directory path
* `nodecg install [repo] [--dev]`
	* Install a bundle by cloning a git repo. Can be a GitHub owner/repo pair (`supportclass/lfg-sublistener`) or 
	https git url (`https://github.com/SupportClass/lfg-sublistener.git`). If run in a bundle directory with no 
	arguments, installs that bundle's dependencies. Enable `--dev` flag to install the bundle's `devDependencies`.
* `nodecg uninstall <bundle>`
	* Uninstall a bundle
* `nodecg defaultconfig`
	* If a bundle has a `configschema.json` present in its root, this command will create a default config file at 
	`nodecg/cfg/:bundleName.json` with defaults based on that schema.
* `nodecg deploy <deploymentDefinitionJson>`
	* Given a valid deployment definition *.json file, will spin up a new DigitalOcean droplet
	and deploy an instance of NodeCG to it, following the specification outlined in the deployment definition.

## Special Thanks
This CLI program is based on [Tim Santeford's commander.js starter](https://github.com/tsantef/commander-starter).  
Portions of code are adapted from zeit's [`now-cli`](https://github.com/zeit/now-cli).
