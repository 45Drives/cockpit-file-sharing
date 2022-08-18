/* Copyright (C) 2022 Josh Boudreau <jboudreau@45drives.com>
 * 
 * This file is part of Cockpit File Sharing.
 * 
 * Cockpit File Sharing is free software: you can redistribute it and/or modify it under the terms
 * of the GNU General Public License as published by the Free Software Foundation, either version 3
 * of the License, or (at your option) any later version.
 * 
 * Cockpit File Sharing is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License along with Cockpit File Sharing.
 * If not, see <https://www.gnu.org/licenses/>. 
 */

import { useSpawn } from "@45drives/cockpit-helpers";

export function generateConfDiff(conf, newConf) {
	let confDiff = { add: [], remove: [] };
	Object.keys(newConf).filter((key) => key !== 'name' && key !== 'advancedSettings').forEach((key) => {
		if (conf === null || newConf[key] !== conf[key]) {
			confDiff.add.push([key, newConf[key]]);
		}
	})
	if (conf) {
		confDiff.add = [
			...confDiff.add,
			...newConf.advancedSettings
				.filter(x => !conf.advancedSettings.includes(x))
				.map((str) => [...str.split('=').map(a => a.trim())])
		];
		let confAdvancedSettingsKeysOnly = conf.advancedSettings
			.map(a => a.split('=')[0].trim());
		let newConfAdvancedSettingsKeysOnly = newConf.advancedSettings
			.map(a => a.split('=')[0].trim());
		confDiff.remove = confAdvancedSettingsKeysOnly
			.filter(key => !newConfAdvancedSettingsKeysOnly.includes(key))
			.map(key => [key]);
	} else {
		confDiff.add = [
			...confDiff.add,
			...newConf.advancedSettings
				.map((str) => [...str.split('=').map(a => a.trim())])
		];
	}
	return confDiff;
}

export function joinAdvancedSettings(advancedSettings) {
	return advancedSettings.filter(a => !/^\s*$/.test(a)).join("\n");
}

export function splitAdvancedSettings(advancedSettings) {
	return advancedSettings.split('\n').filter(a => !/^\s*$/.test(a) && /[^\s#]+\s*=\s*[^\s#]+/.test(a)).map(line => line.replace(/\s*#.*$/, '').replace(/\s*=\s*/, ' = ').trim());
}

export function strToBool(str) {
	const trueStrings = [
		"yes",
		"true",
		"1"
	];
	return trueStrings.includes(String(str).toLowerCase());
}

/**
 * Split string by specified delimiters, ignoring delimiters in quotes
 * Strips quotes from tokens
 * @param {string} str - The string to split
 * @param {string} delims - String of delimiters
 * @returns {string[]} Array of tokens
 */
export function splitQuotedDelim(str, delims) {
	const state = {
		singleQuoted: false,
		doubleQuoted: false,
		/**
		 * @type {string[]}
		 */
		tokens: [],
	}
	return str.split('').reduce((state, char, i, arr) => {
		if (char === '"' && !state.singleQuoted) {
			state.doubleQuoted = !state.doubleQuoted;
		}
		else if (char === '\'' && !state.doubleQuoted)
			state.singleQuoted = !state.singleQuoted;
		else if (delims.includes(char)) {
			// found delim
			if (state.doubleQuoted || state.singleQuoted) {
				// found quoted delim
				state.tokens.push((state.tokens.pop() ?? "") + char);
			} else if (!delims.includes(arr[i - 1])) {
				// start new token if first delim in a row
				state.tokens.push("");
			}
			// else skip char
		} else {
			// append char to token
			state.tokens.push((state.tokens.pop() ?? "") + char);
		}
		return state;
	}, state).tokens;
}
