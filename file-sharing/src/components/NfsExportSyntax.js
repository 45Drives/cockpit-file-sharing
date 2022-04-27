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

export const NfsExportSyntax = {
	parse: (confText) => {
		if (!confText)
			return [];
		const shares = [];
		confText.split('\n').forEach((line) => {
			if (/^\s*#/.test(line) || /^\s*$/.test(line))
				return; // skip comments and empty lines
			const share = { clients: [] };
			const fields = line.split(' ');
			share.path = fields[0].replace(/^\"/, '').replace(/\"$/, '');
			const clients = fields.slice(1);
			for (let client of clients) {
				let host, settings;
				let match = client.match(/^([^(]+)\(([^)]+)\)/);
				host = match[1];
				settings = match[2];
				share.clients.push({ host: host, settings: settings });
			}
			shares.push({ ...share });
		});
		return shares;
	},
	stringify: (shares) => {
		let output = "# managed by cockpit-file-sharing\n# do not modify\n";
		for (const share of shares) {
			output += `"${share.path}"`;
			for (const client of share.clients) {
				output += ` ${client.host}(${client.settings})`;
			}
			output += '\n';
		}
		return output;
	}
}
