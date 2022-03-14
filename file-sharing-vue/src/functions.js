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

export function runCommand(argv) {
	document.getElementById('command-argv').innderText = JSON.stringify(argv);
	return;
	return new Promise(async (resolve, reject) => {
		let proc = cockpit.spawn(argv);
		proc.done((stdout) => resolve(data));
		proc.fail((e, stderr) => reject(stderr));
	})
}

export function strToBool(str) {
	const trueStrings = [
		"yes",
		"true",
		"1"
	];
	return trueStrings.includes(String(str).toLowerCase());
}
