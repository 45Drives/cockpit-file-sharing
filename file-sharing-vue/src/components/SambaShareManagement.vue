<template>
	<div class="samba-share-management">
		<div class="header">
			<h2>Share Management</h2>
			<button @click="showAddShare = !showAddShare">{{ showAddShare ? 'Cancel' : 'Add Share' }}</button>
		</div>
		<div>
			<SambaShareEditor v-if="showAddShare" @apply-share="addShare"/>
		</div>
		<div class="list">
			<SambaShare v-for="(share, index) in shares" :share="share" @delete-share="deleteShare" @update-share="updateShare"/>
		</div>
	</div>
</template>

<script>
import SambaShare from "./SambaShare.vue";
import SambaShareEditor from "./SambaShareEditor.vue";
import { camelize } from "../functions";
export default {
    data() {
        return {
            shares: [],
			globalConfig: {advancedSettings: []},
			showAddShare: false,
        };
    },
    created() {
		this.parseNetConf();
		this.shares.sort((a, b) => a.name.localeCompare(b.name));
    },
    components: { SambaShare, SambaShareEditor },
	methods: {
		parseNetConf() {
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
						this.shares.push({...share, advancedSettings: [...share.advancedSettings]});
					if (match[1] === 'global') {
						share = this.globalConfig;
					} else {
						share = {...shareTemplate, advancedSettings: [...shareTemplate.advancedSettings]};
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
				this.shares.push({...share, advancedSettings: [...share.advancedSettings]});
		},
		deleteShare(share) {
			if(!confirm("Are you sure?"))
				return;
			// run net conf commands
			console.log(`net conf delshare ${share.name}`);
			this.shares = this.shares.filter((a) => a !== share);
		},
		async addShare(share) {
			// run net conf commands
			console.log(`net conf addshare ${share.name} "${share.path}"`);
			await this.applyShareChanges(null, share);
			this.shares = [...this.shares, share];
			this.showAddShare = false;
		},
		async updateShare(share, newShare) {
			// run net conf commands
			await this.applyShareChanges(share, newShare);
			Object.assign(share, newShare);
		},
		async applyShareChanges(share, newShare) {
			let add, remove;
			({add, remove} = this.generateShareConfDiff(share, newShare));
			add.forEach((args) => {
				console.log("net conf setparm " + args.map((arg) => arg !== "" && arg.indexOf(' ') === -1 ? arg : `"${arg}"`).join(" "));
			});
			remove.forEach((args) => {
				console.log("net conf delparm " + args.map((arg) => arg !== "" && arg.indexOf(' ') === -1 ? arg : `"${arg}"`).join(" "));
			});
		},
		generateShareConfDiff(share, newShare) {
			let confDiff = {add: [], remove: []};
			Object.keys(newShare).filter((key) => key !== 'name' && key !== 'advancedSettings').forEach((key) => {
				if (share === null || newShare[key] !== share[key]) {
					confDiff.add.push([newShare.name, key.replace(/([A-Z])/g, " $1").toLowerCase(), newShare[key]]);
				}
			})
			confDiff.add = [
				...confDiff.add,
				...newShare.advancedSettings
					.filter(x => !share.advancedSettings.includes(x))
					.map((str) => [newShare.name, ...str.split('=').map(a => a.trim())])
			];
			if (share) {
				let shareAdvancedSettingsKeysOnly = share.advancedSettings
					.map(a => a.split('=')[0].trim());
				let newShareAdvancedSettingsKeysOnly = newShare.advancedSettings
					.map(a => a.split('=')[0].trim());
				confDiff.remove = shareAdvancedSettingsKeysOnly
					.filter(key => !newShareAdvancedSettingsKeysOnly.includes(key))
					.map(key => [newShare.name, key]);
			}
			return confDiff;
		}
	}
}
</script>

<style>
.samba-share-management {
	display: flex;
	flex-direction: column;
	padding: 5px;
	background-color: white;
	border: 1px solid lightgrey;
	border-radius: 5px;
}

.header {
	display: flex;
	flex-direction: row;
	justify-content: space-between;
	align-items: baseline;
	padding: 0 10px 0 10px;
}

button {
	font-weight: bold;
	border: 1px solid;
	border-radius: 5px;
	margin: 2px;
	display: inline-block;
	width: 100px;
	padding: 5px;
	background-color: white;
	color: rgb(79, 79, 255);
	border-color: rgb(79, 79, 255);
	box-sizing: border-box;
}

button:hover {
	cursor: pointer;
	border-width: 2px;
	margin-top: 1px;
	margin-bottom: 1px;
	background-color: rgb(210, 210, 255);
}

.header > button {
	background-color: white;
	color: green;
	border-color: green;
}

.header > button:hover {
	background-color: lightgreen;
}

.list {
	background-color: white;
	display: flex;
	flex-direction: column;
	overflow: auto;
}

.clickable:hover {
	cursor: pointer;
}
</style>
