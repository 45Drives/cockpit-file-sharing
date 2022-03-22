<template>
	<div v-if="fatalError" class="absolute w-full h-full bg-white/50 dark:bg-black/50 z-50 px-60 pt-5">
		<div class="rounded-md bg-red-50 p-4 grow-0">
			<div class="flex">
				<div class="flex-shrink-0">
					<XCircleIcon class="h-5 w-5 text-red-400" aria-hidden="true" />
				</div>
				<div class="ml-3">
					<h3 class="text-sm font-medium text-red-800 whitespace-pre">{{ fatalError }}</h3>
				</div>
			</div>
		</div>
	</div>
	<div class="max-w-7xl mx-auto sm:px-6 lg:px-8 space-y-8 py-8">
		<div class="card">
			<SambaGlobalManagement :modalPopup="modalPopup" :globalConfig="globalConfig" :loaded="loaded" />
		</div>
		<div class="card">
			<SambaShareManagement
				:modalPopup="modalPopup"
				:shares="shares"
				@refresh-shares="refresh"
				:groups="groups"
				:users="users"
				:loaded="loaded"
				:cephLayoutPools="cephLayoutPools"
				:ctdbHosts="ctdbHosts"
			/>
		</div>
		<div class="card">
			<div class="card-header flex flex-row space-x-3">
				<h3 class="text-lg leading-6 font-medium">Import/Export Config</h3>
				<LoadingSpinner v-if="!loaded" class="w-5 h-5" />
			</div>
			<div class="card-body flex flex-row space-x-3">
				<input @change="importConfig" type="file" hidden id="file-upload" />
				<button @click="uploadConfig" class="btn btn-primary">Import</button>
				<button @click="exportConfig" class="btn btn-primary">Export</button>
			</div>
		</div>
	</div>
</template>

<script>
import { XCircleIcon } from "@heroicons/vue/solid";
import SambaShareManagement from "./SambaShareManagement.vue";
import SambaGlobalManagement from "./SambaGlobalManagement.vue";
import SambaUserManagement from "./SambaUserManagement.vue";
import useSpawn from "./UseSpawn";
import { ref, reactive, watch } from "vue";

const spawnOpts = {
	superuser: 'try',
}

export default {
	props: {
		modalPopup: Object,
	},
	setup(props, ctx) {
		const shares = ref([]);
		const globalConfig = reactive({ advancedSettings: [] });
		const users = ref([]);
		const groups = ref([]);
		const loaded = ref(false);
		const fatalError = ref("");
		const domainJoined = ref(false);
		const ctdbHosts = ref([]);
		const cephLayoutPools = ref([]);

		const parseNetConf = async () => {
			shares.value = [];
			globalConfig.advancedSettings = [];
			const simpleSettingsShare = [
				"comment",
				"path",
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
			try {
				const netConfOutput = (await useSpawn(['net', 'conf', 'list'], { ...spawnOpts, superuser: 'require' }).promise()).stdout;
				let match;
				netConfOutput.split('\n').forEach((line) => {
					if ((match = line.match(/\[([^\]]+)]/))) {
						if (share && share !== globalConfig)
							shares.value.push({ ...share, advancedSettings: [...share.advancedSettings] });
						if (match[1] === 'global') {
							share = globalConfig;
						} else {
							share = { ...shareTemplate, advancedSettings: [...shareTemplate.advancedSettings] };
							share.name = match[1];
						}
					} else if ((match = line.match(/^([^=]+)=(.*)$/))) {
						let key = match[1].trim();
						let value = match[2].trim();
						if ((share === globalConfig && simpleSettingsGlobal.includes(key))
							|| (share !== globalConfig && simpleSettingsShare.includes(key)))
							share[key] = value;
						else
							share.advancedSettings.push(`${key} = ${value}`);
					}
				});
				if (share && share !== globalConfig)
					shares.value.push({ ...share, advancedSettings: [...share.advancedSettings] });
			} catch (state) {
				fatalError.value += "Error while getting shares: " + state.stderr + '\n';
			}
		};

		const checkIsDomain = async () => {
			try {
				const result = (await useSpawn(['realm', 'list'], spawnOpts).promise()).stdout;
				if (result)
					return true;
			} catch (state) { } // ignore, not using domain if realm not installed
			return false;
		}

		const getUsers = async () => {
			users.value = [];
			try {
				const passwdDB = (await useSpawn(['getent', 'passwd'], spawnOpts).promise()).stdout;
				passwdDB.split('\n').forEach((record) => {
					const fields = record.split(':');
					const user = fields[0];
					const uid = fields[2];
					if (uid >= 1000)
						users.value.push({ user: user, domain: false, pretty: user });
				})
				if (domainJoined.value) {
					const domainUsersDB = (await useSpawn(['wbinfo', '-u'], spawnOpts).promise()).stdout
					domainUsersDB.split('\n').forEach((record) => {
						if (/^\s*$/.test(record))
							return;
						users.value.push({ user: record.replace(/^[^\\]+\\/, ""), domain: true, pretty: record.replace(/^[^\\]+\\/, "") + " (domain)" });
					})
				}
				users.value.sort((a, b) => a.pretty.localeCompare(b.pretty));
			} catch (state) {
				fatalError.value += "Error while getting users: " + state.stderr + '\n';
			}
		}

		const getGroups = async () => {
			groups.value = [];
			try {
				const groupDB = (await useSpawn(['getent', 'group'], spawnOpts).promise()).stdout;
				groupDB.split('\n').forEach((record) => {
					const fields = record.split(':');
					const group = fields[0];
					const gid = fields[2];
					if (gid >= 1000)
						groups.value.push({ group: group, domain: false, pretty: group });
				})
				if (domainJoined.value) {
					const domainGroupsDB = (await useSpawn(['wbinfo', '-g'], spawnOpts).promise()).stdout
					domainGroupsDB.split('\n').forEach((record) => {
						if (/^\s*$/.test(record))
							return;
						groups.value.push({ group: record.replace(/^[^\\]+\\/, ""), domain: true, pretty: record.replace(/^[^\\]+\\/, "") + " (domain)" });
					})
				}
				groups.value.sort((a, b) => a.pretty.localeCompare(b.pretty));
			} catch (state) {
				fatalError.value += "Error while getting groups: " + state.stderr + '\n';
			}
		}

		const checkConf = async () => {
			try {
				const smbConfFile = cockpit.file("/etc/samba/smb.conf", { superuser: 'try' });
				const smbConf = await smbConfFile.read();
				if (!/(?<=\[ ?global ?\][^\[\]]*)^\s*include ?= ?registry/mg.test(smbConf)) {
					if (await props.modalPopup.confirm(
						"Samba is Misconfigured",
						"`include = registry` is missing from the global section of /etc/samba/smb.conf. Insert it now?",
						{ danger: true }
					)) {
						if (!/\[ ?global ?\]/.test(smbConf)) {
							await smbConfFile.modify((content) => {
								return "[global] # inserted by cockpit-file-sharing\n\tinclude = registry # inserted by cockpit-file-sharing\n" + (content ?? "");
							});
						} else {
							await smbConfFile.modify((content) => {
								return content.replace(/(?<=\[ ?global ?\](?:[^\[]*\n)*)(?=\s*\[|$)/si, "\tinclude = registry # inserted by cockpit-file-sharing\n");
							});
						}
						useSpawn(['smbcontrol', 'all', 'reload-config'], spawnOpts);
					} else
						fatalError.value += "`include = registry` missing from /etc/samba/smb.conf\n";
				}
				smbConfFile.close();
			} catch (error) {
				fatalError.value += "Failed to read /etc/smb.conf: " + error?.message ?? error;
			}
		}

		const getCtdbHosts = async () => {
			try {
				const nodes = await cockpit.file("/etc/ctdb/nodes", { superuser: "try" }).read();
				ctdbHosts.value = nodes.split('\n').filter(line => line !== "");
			} catch { /* not using ctdb */ }
		}

		const getCephLayoutPools = async () => {
			try {
				const cephFsStatus = JSON.parse((await useSpawn(['ceph', 'fs', 'status', '--format=json'], spawnOpts).promise()).stdout);
				cephLayoutPools.value = cephFsStatus.pools.filter(pool => pool.type === 'data').map(pool => pool.name);
			} catch(state) { /* not ceph */ }
		}

		const refresh = async () => {
			loaded.value = false;
			domainJoined.value = await checkIsDomain();
			const procs = [];
			procs.push(parseNetConf());
			procs.push(getUsers());
			procs.push(getGroups());
			procs.push(checkConf());
			procs.push(getCtdbHosts());
			procs.push(getCephLayoutPools());
			for (let proc of procs)
				await proc;
			shares.value.sort((a, b) => a.name.localeCompare(b.name));
			loaded.value = true;
		};

		refresh();

		const uploadConfig = async () => {
			if (!await props.modalPopup.confirm(
				"This will permanently overwrite current configuration. Are you sure?",
				"",
				{ danger: true }
			))
				return;
			document.getElementById("file-upload").click();
		}

		const importConfig = (event) => {
			const file = event.target.files[0];
			let reader = new FileReader();
			reader.onload = async (event) => {
				const content = event.target.result;
				let tmpFile;
				try {
					tmpFile = (await useSpawn(['mktemp'], spawnOpts).promise()).stdout;
					// could use cockpit.file here, but easier to use useSpawn with dd to
					// catch the state object if there are any errors
					const writerState = useSpawn(['dd', `of=${tmpFile}`], spawnOpts);
					writerState.proc.input(content);
					await writerState.promise();
					await useSpawn(['net', 'conf', 'import', tmpFile], spawnOpts).promise();
					await refresh();
				} catch (state) {
					await props.modalPopup.alert("Failed to import config", state.stderr, { danger: true });
				} finally {
					if (tmpFile)
						useSpawn(['rm', '-f', tmpFile], spawnOpts);
				}
			}
			reader.readAsText(file);
		}

		const exportConfig = async () => {
			const backendPath = "/tmp/cockpit-file-sharing_samba_exported.conf";
			const date = new Date();
			const filename = `cockpit-file-sharing_samba_exported_${date.toISOString().replace(/:/g, '-').replace(/T/, '_')}.conf`;
			let config;
			try {
				config = (await useSpawn(['net', 'conf', 'list'], spawnOpts).promise()).stdout;
			} catch (state) {
				console.error(state);
				await props.modalPopup.alert("Failed to get configuration", state.stderr, { danger: true });
			}
			try {
				await cockpit.file(backendPath).replace(config);
			} catch (err) {
				await props.modalPopup.alert("Failed to write configuration to tmp", err.message, { danger: true });
			}
			let query = window.btoa(JSON.stringify({
				payload: 'fsread1',
				binary: 'raw',
				path: backendPath,
				superuser: false,
				max_read_size: 1024 * 1024,
				external: {
					'content-disposition': 'attachment; filename="' + filename + '"',
					'content-type': 'application/x-xz, application/octet-stream'
				},
			}));
			let prefix = (new URL(cockpit.transport.uri('channel/' + cockpit.transport.csrf_token))).pathname;
			var a = document.createElement("a");
			a.href = prefix + "?" + query;
			a.style.display = "none";
			a.download = filename;
			document.body.appendChild(a);
			var event = new MouseEvent('click', {
				'view': window,
				'bubbles': false,
				'cancelable': true
			});
			a.dispatchEvent(event);
			document.body.removeChild(a);
		}

		return {
			shares,
			globalConfig,
			users,
			groups,
			loaded,
			fatalError,
			ctdbHosts,
			cephLayoutPools,
			parseNetConf,
			getUsers,
			getGroups,
			refresh,
			uploadConfig,
			importConfig,
			exportConfig,
		}
	},
	components: { SambaShareManagement, SambaGlobalManagement, SambaUserManagement, XCircleIcon }
}
</script>
