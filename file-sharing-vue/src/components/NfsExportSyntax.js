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
