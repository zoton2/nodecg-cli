# nodecg-cli [![Build Status](https://travis-ci.org/nodecg/nodecg-cli.svg?branch=master)](https://travis-ci.org/nodecg/nodecg-cli) [![Coverage Status](https://coveralls.io/repos/github/nodecg/nodecg-cli/badge.svg?branch=master)](https://coveralls.io/github/nodecg/nodecg-cli?branch=master) [![Greenkeeper badge](https://badges.greenkeeper.io/nodecg/nodecg-cli.svg)](https://greenkeeper.io/)

[NodeCG](https://github.com/nodecg/nodecg)'s command line interface.

## Installation
1. Install [Node.js](https://nodejs.org/en/) v7.6.0 or greater.
2. Make sure you have [git](http://git-scm.com/) installed, and that it is in your PATH.
3. Install [bower](http://bower.io/), which may be used to install bundles' dependencies:

	```sh
	npm install -g bower
	```

4. Install the nodecg-cli beta via npm:

	```sh
	npm install -g nodecg-cli@beta
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
* `nodecg deploy <deploymentDefinitonFilePath>`
	* Given a valid deployment definition *.json file, will spin up a new DigitalOcean droplet
	and deploy an instance of NodeCG to it, following the specification outlined in the deployment definition.
	
## About automated deploys
- Syntax is `nodecg deploy <deploymentDefinitonFilePath>`, where `deploymentDefinitonFilePath` is either a YAML or JSON file.
  - These deployment definitions have really complex schemas. You can read the [schema file](/schemas/deployment.yml)
  to learn more about how these files should be structured. `nodecg deploy` should also throw helpful errors if your
  deployment definition file is wrong.
- Only deploys to DigitalOcean.
- `secure` is true by default, which requests a certificate from [Lets Encrypt](https://letsencrypt.org/).
  - Be aware of how many certs you've requested for a given domain and avoid ratelimiting yourself.
  - If you're just testing deployments, add `debug: true` to your deployment definition file, which
  will just request a "staging" cert from Lets Encrypt, and not count against the ratelimit.
- It is highly recommended to use a block storage volume, which will store your deployment's `assets`, `logs`,
and `db` folders (which contains persisted Replicants). In addition, it will save your Lets Encrypt certificate. These
stored files can be used in future deployments by attaching this same block storage volume to them.
  - If you choose not to use block storage, but still have `secure` turned on, you'll be requesting a new cert
  with every deployment, and will quickly get ratelimited by Lets Encrypt. Be warned!
- Likely still has many bugs. Report them as you find them!
- Suggestions welcome!
- Pull requests welcome!

### Example deployment definition file
Save this as `example.yml`. Edit to replace the placeholder values with your own info. Then, run:
```sh
nodecg deploy example.yml
```

```yaml
---
debug: true
secure: true
domain: subdomain.example.com
email: YOUR_EMAIL_ADDRESS
droplet:
  name: deploy-test
  region: nyc1
volume:
  size_gigabytes: 3
  name: deploy-test-volume
nodecg:
  version: "~0.8.9"
  config:
    login:
      enabled: true
      # You'll need to make a new Twitch app here: https://www.twitch.tv/kraken/oauth2/clients/new
      # Set the Redirect URI to https://YOUR_DOMAIN_HERE/login/auth/twitch
      # If you have `secure` set to `false`, then use `http` instead of `https` for the Redirect URI.
      twitch:
        enabled: true
        clientID: YOUR_TWITCH_APP_CLIENT_SECRET
        clientSecret: YOUR_TWITCH_APP_CLIENT_SECRET
        allowedUsernames:
        - YOUR_TWITCH_USERNAME
# Both GitHub and BitBucket are supported. Other git providers not supported at this time.
bundles:
  lange-notify:
    url: https://github.com/Lange/lange-notify
    version: "^2.1.0"
    config:
      foo: bar
  lfg-nucleus:
    url: https://github.com/SupportClass/lfg-nucleus
    version: "^3.0.0"
  lfg-filter:
    url: https://github.com/SupportClass/lfg-filter
    version: "^3.0.0"
```

## Special Thanks
This CLI program is based on [Tim Santeford's commander.js starter](https://github.com/tsantef/commander-starter).  
Portions of code are adapted from zeit's [`now-cli`](https://github.com/zeit/now-cli).
