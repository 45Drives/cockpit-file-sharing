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

import useSpawn from "./components/UseSpawn"

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

export async function getUsers(domainJoined) {
	let users = [];
	try {
		const passwdDB = (await useSpawn(['getent', 'passwd'], spawnOpts).promise()).stdout;
		passwdDB.split('\n').forEach((record) => {
			const fields = record.split(':');
			const user = fields[0];
			const uid = fields[2];
			if (uid >= 1000 || uid === '0') // include root
				users.push({ user: user, domain: false, pretty: user });
		})
		if (domainJoined) {
			const domainUsersDB = (await useSpawn(['wbinfo', '-u'], spawnOpts).promise()).stdout
			domainUsersDB.split('\n').forEach((record) => {
				if (/^\s*$/.test(record))
					return;
				users.push({ user: record.replace(/^[^\\]+\\/, ""), domain: true, pretty: record.replace(/^[^\\]+\\/, "") + " (domain)" });
			})
		}
		users.sort((a, b) => a.pretty.localeCompare(b.pretty));
		return users;
	} catch (state) {
		console.error(state);
		throw new Error("Error while getting users: " + state.stderr);
	}
}

export async function getGroups(domainJoined) {
	let groups = [];
	try {
		const groupDB = (await useSpawn(['getent', 'group'], spawnOpts).promise()).stdout;
		groupDB.split('\n').forEach((record) => {
			const fields = record.split(':');
			const group = fields[0];
			const gid = fields[2];
			if (gid >= 1000 || gid === '0')
				groups.push({ group: group, domain: false, pretty: group });
		})
		if (domainJoined) {
			const domainGroupsDB = (await useSpawn(['wbinfo', '-g'], spawnOpts).promise()).stdout
			domainGroupsDB.split('\n').forEach((record) => {
				if (/^\s*$/.test(record))
					return;
				groups.push({ group: record.replace(/^[^\\]+\\/, ""), domain: true, pretty: record.replace(/^[^\\]+\\/, "") + " (domain)" });
			})
		}
		groups.sort((a, b) => a.pretty.localeCompare(b.pretty));
		return groups
	} catch (state) {
		console.error(state);
		throw new Error("Error while getting groups: " + state.stderr);
	}
}
