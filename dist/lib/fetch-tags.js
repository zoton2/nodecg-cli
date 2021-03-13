"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
function default_1(repoUrl) {
    const rawTags = child_process_1.execSync(`git ls-remote --refs --tags ${repoUrl}`).toString().trim().split('\n');
    return rawTags.map((rawTag) => rawTag.split('refs/tags/').pop());
}
exports.default = default_1;
