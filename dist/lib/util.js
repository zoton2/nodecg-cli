"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const fs_1 = tslib_1.__importDefault(require("fs"));
const path_1 = tslib_1.__importDefault(require("path"));
exports.default = {
    /**
     * Checks if the given directory contains a NodeCG installation.
     * @param pathToCheck
     */
    pathContainsNodeCG(pathToCheck) {
        const pjsonPath = path_1.default.join(pathToCheck, 'package.json');
        if (fs_1.default.existsSync(pjsonPath)) {
            const pjson = require(pjsonPath);
            return pjson.name.toLowerCase() === 'nodecg';
        }
        return false;
    },
    /**
     * Gets the nearest NodeCG installation folder. First looks in process.cwd(), then looks
     * in every parent folder until reaching the root. Throws an error if no NodeCG installation
     * could be found.
     * @returns {*|String}
     */
    getNodeCGPath() {
        let curr = process.cwd();
        do {
            if (this.pathContainsNodeCG(curr)) {
                return curr;
            }
            const nextCurr = path_1.default.resolve(curr, '..');
            if (nextCurr === curr) {
                throw new Error('NodeCG installation could not be found in this directory or any parent directory.');
            }
            curr = nextCurr;
        } while (fs_1.default.lstatSync(curr).isDirectory());
        throw new Error('NodeCG installation could not be found in this directory or any parent directory.');
    },
    /**
     * Checks if the given directory is a NodeCG bundle.
     * @param pathToCheck
     * @returns {boolean}
     */
    isBundleFolder(pathToCheck) {
        const pjsonPath = path_1.default.join(pathToCheck, 'package.json');
        if (fs_1.default.existsSync(pjsonPath)) {
            const pjson = require(pjsonPath);
            return typeof pjson.nodecg === 'object';
        }
        return false;
    },
};
