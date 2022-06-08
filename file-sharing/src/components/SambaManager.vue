<!--
Copyright (C) 2022 Josh Boudreau <jboudreau@45drives.com>

This file is part of Cockpit File Sharing.

Cockpit File Sharing is free software: you can redistribute it and/or modify it under the terms
of the GNU General Public License as published by the Free Software Foundation, either version 3
of the License, or (at your option) any later version.

Cockpit File Sharing is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with Cockpit File Sharing.
If not, see <https://www.gnu.org/licenses/>. 
-->

<template>
	<div class="centered-column p-well space-y-well">
		<SambaGlobalManagement :globalConfig="globalConfig" :processing="processing" @startProcessing="processing++"
			@stopProcessing="processing--" />
		<SambaShareManagement :shares="shares" @refreshShares="refresh" :groups="groups" :users="users"
			:cephLayoutPools="cephLayoutPools" :ctdbHosts="ctdbHosts" :parentProcessing="processing"
			@appendShareToList="share => shares = [...shares, share].sort((a, b) => a.name.localeCompare(b.name))"
			@removeShareFromList="share => shares = shares.filter((a) => a !== share)" />
		<div class="card">
			<div class="card-header flex flex-row space-x-2 items-center">
				<div class="text-header">Import/Export Config</div>
				<LoadingSpinner v-if="processing" class="size-icon" />
			</div>
			<div class="card-body button-group-row">
				<input @change="importConfig" type="file" id="file-upload" hidden />
				<button @click="uploadConfig" class="btn btn-primary">Import</button>
				<button @click="exportConfig" class="btn btn-primary">Export</button>
			</div>
		</div>
	</div>
	<ModalPopup :showModal="confirmationModal.showModal" @apply="confirmationModal.applyCallback"
		@cancel="confirmationModal.cancelCallback" applyDangerous applyText="Yes"
		:headerText="confirmationModal.headerText">
		<template #icon>
			<ExclamationCircleIcon class="size-icon-xl icon-danger shrink-0" />
		</template>
		{{ confirmationModal.bodyText }}
	</ModalPopup>
</template>

<script>
import { XCircleIcon, ExclamationCircleIcon } from "@heroicons/vue/solid";
import SambaShareManagement from "./SambaShareManagement.vue";
import SambaGlobalManagement from "./SambaGlobalManagement.vue";
import { useSpawn, errorString, errorStringHTML } from "@45drives/cockpit-helpers";
import { ref, reactive, watch, inject, onBeforeUnmount } from "vue";
import { getUsers, getGroups } from "../functions";
import LoadingSpinner from "./LoadingSpinner.vue";
import { notificationsInjectionKey } from "../keys";
import ModalPopup from "./ModalPopup.vue";

export default {
	setup(props, ctx) {
		const shares = ref([]);
		const globalConfig = reactive({ advancedSettings: [] });
		const users = ref([]);
		const groups = ref([]);
		const domainJoined = ref(false);
		const ctdbHosts = ref([]);
		const cephLayoutPools = ref([]);
		const processing = ref(0);
		const notifications = inject(notificationsInjectionKey);
		const confirmationModal = reactive({
			showModal: false,
			headerText: "",
			bodyText: "",
			ask: (header, body) => {
				return new Promise((resolve, reject) => {
					confirmationModal.showModal = true;
					confirmationModal.headerText = header;
					confirmationModal.bodyText = body;
					const respond = (result) => {
						confirmationModal.showModal = false;
						resolve(result);
					}
					confirmationModal.applyCallback = () => respond(true);
					confirmationModal.cancelCallback = () => respond(false);
				});
			},
			applyCallback: () => { },
			cancelCallback: () => { },
		});

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
			processing.value++;
			try {
				const netConfOutput = (await useSpawn(['net', 'conf', 'list'], { superuser: 'try' }).promise()).stdout;
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
				notifications.value.constructNotification("Failed to get shares", errorStringHTML(state), 'error');
			} finally {
				processing.value--;
			}
		};

		const checkIsDomain = async () => {
			try {
				const result = (await useSpawn(['realm', 'list'], { superuser: 'try' }).promise()).stdout;
				if (result)
					return true;
			} catch (state) { } // ignore, not using domain if realm not installed
			return false;
		}

		const getUserList = async () => {
			processing.value++;
			try {
				users.value = await getUsers(domainJoined.value);
			} catch (error) {
				notifications.value.constructNotification("Failed to get users", errorStringHTML(error), 'error');
			} finally {
				processing.value--;
			}
		}

		const getGroupList = async () => {
			processing.value++;
			try {
				groups.value = await getGroups(domainJoined.value);
			} catch (error) {
				notifications.value.constructNotification("Failed to get groups", errorStringHTML(error), 'error');
			} finally {
				processing.value--;
			}
		}

		const checkConf = async () => {
			processing.value++;
			try {
				const smbConfFile = cockpit.file("/etc/samba/smb.conf", { superuser: 'try' });
				const smbConf = await smbConfFile.read();
				smbConfFile.close();
				const globalSectionText = smbConf.match(/^\s*\[ ?global ?\]\s*$(?:\n^(?!\s*\[).*$)*/mi)?.[0];
				if (!globalSectionText || !/^[\t ]*include[\t ]*=[\t ]*registry/m.test(globalSectionText)) {
					notifications.value.constructNotification(
						"Samba is Misconfigured",
						"`include = registry` is missing from the global section of /etc/samba/smb.conf, which is required for File Sharing to manage shares.",
						'error'
					).addAction("Fix now", async () => {
						processing.value++;
						try {
							await smbConfFile.modify((content) => {
								return globalSectionText
									? content.replace(/^\s*\[ ?global ?\]\s*$(?:\n^(?!;?\s*\[).*$)*/mi, "$&\n\tinclude = registry # inserted by cockpit-file-sharing\n")
									: "[global] # inserted by cockpit-file-sharing\n\tinclude = registry # inserted by cockpit-file-sharing\n" + (content ?? "");
							});
							await useSpawn(['smbcontrol', 'all', 'reload-config'], { superuser: 'try' });
						} catch (error) {
							notifications.value.constructNotification("Failed to fix Samba configuration", errorStringHTML(error), 'error');
						} finally {
							processing.value--;
						}
					});
				}
			} catch (error) {
				notifications.value.constructNotification("Failed to validate /etc/samba/smb.conf: ", errorStringHTML(error), 'error');
			} finally {
				processing.value--;
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
				const cephFsStatus = JSON.parse((await useSpawn(['ceph', 'fs', 'status', '--format=json'], { superuser: 'try' }).promise()).stdout);
				cephLayoutPools.value = cephFsStatus.pools.filter(pool => pool.type === 'data').map(pool => pool.name);
			} catch (state) { /* not ceph */ }
		}

		const refresh = async () => {
			processing.value++;
			try {
				domainJoined.value = await checkIsDomain();
				const procs = [];
				procs.push(parseNetConf());
				procs.push(getUserList());
				procs.push(getGroupList());
				procs.push(checkConf());
				procs.push(getCtdbHosts());
				procs.push(getCephLayoutPools());
				for (let proc of procs)
					await proc;
				shares.value.sort((a, b) => a.name.localeCompare(b.name));
			} finally {
				processing.value--;
			}
		};

		refresh();

		const uploadConfig = async () => {
			if (!await confirmationModal.ask(
				"This will permanently overwrite current configuration",
				"Are you sure?"
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
					tmpFile = (await useSpawn(['mktemp'], { superuser: 'try' }).promise()).stdout;
					// could use cockpit.file here, but easier to use useSpawn with dd to
					// catch the state object if there are any errors
					const writerState = useSpawn(['dd', `of=${tmpFile}`], { superuser: 'try' });
					writerState.proc.input(content);
					await writerState.promise();
					await useSpawn(['net', 'conf', 'import', tmpFile], { superuser: 'try' }).promise();
					await refresh();
				} catch (state) {
					notifications.value.constructNotification("Failed to import config", errorStringHTML(error), 'error');
				} finally {
					if (tmpFile)
						useSpawn(['rm', '-f', tmpFile], { superuser: 'try' });
					processing.value--;
				}
			}
			reader.onerror = (event) => {
				notifications.value.constructNotification("Failed to import config", "Error reading file on client side", 'error');
				processing.value--;
			}
			processing.value++;
			reader.readAsText(file);
		}

		const exportConfig = async () => {
			const backendPath = "/tmp/cockpit-file-sharing_samba_exported.conf";
			const date = new Date();
			const filename = `cockpit-file-sharing_samba_exported_${date.toISOString().replace(/:/g, '-').replace(/T/, '_')}.conf`;
			let config;
			try {
				config = (await useSpawn(['net', 'conf', 'list'], { superuser: 'try' }).promise()).stdout;
			} catch (state) {
				notifications.value.constructNotification("Failed to get configuration", errorStringHTML(state), 'error');
				return;
			}
			try {
				await cockpit.file(backendPath).replace(config);
			} catch (error) {
				notifications.value.constructNotification("Failed to write configuration to temp file", errorStringHTML(error), 'error');
				return;
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

		const watchHandles = [];

		watchHandles.push(cockpit.file('/etc/group', { superuser: 'try' }).watch(() => getGroupList(), { read: false }));
		watchHandles.push(cockpit.file('/etc/passwd', { superuser: 'try' }).watch(() => getUserList(), { read: false }));
		watchHandles.push(cockpit.file('/etc/ctdb/nodes', { superuser: 'try' }).watch(() => getCtdbHosts(), { read: false }));
		
		onBeforeUnmount(() => watchHandles.map(handle => handle?.remove?.()));

		return {
			shares,
			globalConfig,
			users,
			groups,
			processing,
			confirmationModal,
			ctdbHosts,
			cephLayoutPools,
			parseNetConf,
			getUserList,
			getGroupList,
			refresh,
			uploadConfig,
			importConfig,
			exportConfig,
		}
	},
	components: {
		SambaShareManagement,
		SambaGlobalManagement,
		XCircleIcon,
		LoadingSpinner,
		ModalPopup,
		ExclamationCircleIcon,
	}
}
</script>
