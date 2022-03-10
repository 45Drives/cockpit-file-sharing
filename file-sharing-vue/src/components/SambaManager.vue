<template>
	<div class="max-w-7xl mx-auto sm:px-6 lg:px-8 space-y-8">
		<div class="card">
			<SambaGlobalManagement :initialGlobalConfig="globalConfig" />
		</div>
		<div class="card">
			<SambaShareManagement :initialShares="shares" />
		</div>
	</div>
</template>

<script>
import SambaShareManagement from "./SambaShareManagement.vue";
import { camelize } from "../functions";
import SambaGlobalManagement from "./SambaGlobalManagement.vue";
export default {
	data() {
		return {
			shares: [],
			globalConfig: { advancedSettings: [] },
		}
	},
	created() {
		this.parseNetConf();
		this.shares.sort((a, b) => a.name.localeCompare(b.name));
	},
	methods: {
		async parseNetConf() {
			this.shares = [];
			const simpleSettingsShare = [
				"comment",
				"path",
				"windows acls",
				"valid users",
				"guest ok",
				"read only",
				"browseable",
			];
			const simpleSettingsGlobal = [
				"server string",
				"workgroup",
				"log level",
			];
			const shareTemplate = {
				name: "",
				comment: "",
				path: "",
				windowsAcls: "no",
				validUsers: "",
				guestOk: "no",
				readOnly: "no",
				browseable: "yes",
				advancedSettings: []
			};
			let share = null;
			let netConfOutput =
				`[global]
        server string = Samba Test Server
        workgroup = SAMBA-MGR-TEST
        log level = 2

[share_1]
        path = /mnt/test
        guest ok = no
        read only = yes
        comment = A Test Share
        browseable = yes
        valid users = @autotier, @test, root

[test]
        guest ok = no
        read only = yes
        comment = 
        valid users = 
        browseable = yes
        path = /not/a/path2`;
			let match;
			netConfOutput.split('\n').forEach((line) => {
				if ((match = line.match(/\[([^\]]+)]/))) {
					if (share && share !== this.globalConfig)
						this.shares.push({ ...share, advancedSettings: [...share.advancedSettings] });
					if (match[1] === 'global') {
						share = this.globalConfig;
					} else {
						share = { ...shareTemplate, advancedSettings: [...shareTemplate.advancedSettings] };
						share.name = match[1];
					}
				} else if ((match = line.match(/^([^=]+)=(.*)$/))) {
					let key = match[1].trim();
					let value = match[2].trim();
					if ((share === this.globalConfig && simpleSettingsGlobal.includes(key))
						|| (share !== this.globalConfig && simpleSettingsShare.includes(key)))
						share[camelize(key)] = value;
					else
						share.advancedSettings.push(`${key} = ${value}`);
				}
			});
			if (share && share !== this.globalConfig)
				this.shares.push({ ...share, advancedSettings: [...share.advancedSettings] });
		},
	},
	components: { SambaShareManagement, SambaGlobalManagement }
}
</script>
