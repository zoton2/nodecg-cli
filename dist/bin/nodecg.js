#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const chalk_1 = tslib_1.__importDefault(require("chalk"));
const child_process_1 = require("child_process");
const REQUIRED_VERSION = 'v0.11.22';
if (typeof child_process_1.execSync !== 'function') {
    console.error('nodecg-cli relies on %s, which was added to Node.js in %s (your version: %s).', chalk_1.default.cyan('execSync'), chalk_1.default.magenta(REQUIRED_VERSION), chalk_1.default.magenta(process.version));
    console.error('Please upgrade your Node.js installation.');
    process.exit(1);
}
try {
    child_process_1.execSync('git --version', { stdio: ['pipe', 'pipe', 'pipe'] });
}
catch (_) {
    console.error('nodecg-cli requires that %s be available in your PATH.', chalk_1.default.cyan('git'));
    console.error('If you do not have %s installed, you can get it from http://git-scm.com/', chalk_1.default.cyan('git'));
    console.error('By default, the installer will add %s to your PATH.', chalk_1.default.cyan('git'));
    process.exit(1);
}
require('..');
