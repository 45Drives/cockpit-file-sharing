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

const spawnOpts = {
	superuser: 'try',
}

/**
 * 
 * @param {String} type - 'group' or 'user'
 * @param {boolean} domain 
 * @returns 
 */
const parseRecord = (type, domain) => (record) => {
	if (!record)
		return null;
	let nameKey = type;
	let idKey = type === 'group' ? 'gid' : 'uid';

	const fields = record.split(':');
	const name = fields[0];
	const id = fields[2];
	if (id >= 1000 || id === '0') // include root
		return { [nameKey]: name, [idKey]: id, domain, pretty: name + (domain ? ' (domain)' : '') };
	return null;
};

const getent = async (db) => {
	const [name, wbinfoFlag] = db === 'passwd' ? ['user', '-u'] : ['group', '-g'];
	const entries = [];
	try {
		entries.push(
			...(await useSpawn(['getent', '-s', 'files', db], spawnOpts).promise()).stdout
				.split('\n')
				.map(parseRecord(name, false))
				.filter(user => user !== null)
		);
		const domainItemNames = (await useSpawn(['wbinfo', wbinfoFlag], spawnOpts).promise()).stdout
			.split('\n')
			.filter(entry => entry);
		entries.push(
			...(await useSpawn(['getent', db, ...domainItemNames], spawnOpts).promise().catch(state => {
				console.error('getent error while getting domains:', state);
				return state;
			})).stdout
				.split('\n')
				.map(parseRecord(name, true))
				.filter(item => item !== null)
		);
	} finally {
		return entries.sort((a, b) => a.pretty.localeCompare(b.pretty));
	}
}

/**
 * get list of user objects from system and domain if joined
 * 
 * @returns {Promise<Object[]>}
 */
export function getUsers() {
	return getent('passwd');
}

/**
 * get list of group objects from system and domain if joined
 * 
 * @returns {Promise<Object[]>}
 */
export function getGroups() {
	return getent('group');
}
