<template>
	<div class="max-w-7xl mx-auto sm:px-6 lg:px-8 space-y-8">
		<div class="card">
			<SambaGlobalManagement :initialGlobalConfig="globalConfig" />
		</div>
		<div class="card">
			<SambaShareManagement
				:initialShares="shares"
				@refresh-shares="parseNetConf"
				:groups="groups"
				:users="users"
			/>
		</div>
		<div class="card">
			<SambaUserManagement :groups="groups" :users="users" />
		</div>
	</div>
</template>

<script>
import SambaShareManagement from "./SambaShareManagement.vue";
import SambaGlobalManagement from "./SambaGlobalManagement.vue";
import SambaUserManagement from "./SambaUserManagement.vue";

export default {
	data() {
		return {
			shares: [],
			globalConfig: { advancedSettings: [] },
			users: [],
			groups: [],
		}
	},
	async created() {
		this.parseNetConf();
		this.shares.sort((a, b) => a.name.localeCompare(b.name));
		this.users = await this.getUsers();
		this.groups = await this.getGroups();
	},
	methods: {
		async getUsers() {
			console.log(['getent','passwd'])
			return [
				'root',
				'jdoe',
				'test'
			];
		},
		async getGroups() {
			console.log(['getent', 'group']);
			return [
				"root",
				"adm",
				"wheel",
				"kmem",
				"tty",
				"utmp",
				"audio",
				"disk",
				"input",
				"kvm",
				"lp",
				"optical",
				"render",
				"storage",
				"uucp",
				"video",
				"users",
				"sys",
				"mem",
				"ftp",
				"mail",
				"log",
				"smmsp",
				"proc",
				"games",
				"lock",
				"network",
				"floppy",
				"scanner",
				"power",
				"systemd-journal",
				"rfkill",
				"nobody",
				"dbus",
				"bin",
				"daemon",
				"http",
				"systemd-journal-remote",
				"systemd-network",
				"systemd-resolve",
				"systemd-timesync",
				"systemd-coredump",
				"uuidd",
				"dhcpcd",
				"dnsmasq",
				"rpc",
				"adbusers",
				"ntp",
				"avahi",
				"colord",
				"cups",
				"flatpak",
				"geoclue",
				"git",
				"mpd",
				"nm-openconnect",
				"nm-openvpn",
				"polkitd",
				"rtkit",
				"sddm",
				"tss",
				"usbmux",
				"jboudreau",
				"libvirt",
				"cockpit-ws",
				"cockpit-wsinstance",
				"openvpn",
				"nvidia-persistenced",
				"saned",
				"docker",
				"autotier",
				"test",
				"libvirt-qemu",
				"sgx",
				"systemd-oom",
				"libvirtdbus",
				"brlapi",
				"brltty",
				"gluster",
				"ceph",
				"i2c",
			];
		},
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
				"name": "",
				"comment": "",
				"path": "",
				"valid users": "",
				"guest ok": "no",
				"read only": "no",
				"browseable": "yes",
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
						share[key] = value;
					else
						share.advancedSettings.push(`${key} = ${value}`);
				}
			});
			if (share && share !== this.globalConfig)
				this.shares.push({ ...share, advancedSettings: [...share.advancedSettings] });
		},
	},
	components: { SambaShareManagement, SambaGlobalManagement, SambaUserManagement }
}
</script>
