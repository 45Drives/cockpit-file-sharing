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
	<div
		class="centered-column p-well space-y-well"
		:class="{ 'cursor-wait': processing }"
	>
		<SambaGlobalManagement
			:globalConfig="globalConfig"
			:processing="processing"
			@startProcessing="processing++"
			@stopProcessing="processing--"
		/>
		<SambaShareManagement
			:shares="shares"
			@refreshShares="refresh"
			:groups="groups"
			:users="users"
			:cephLayoutPools="cephLayoutPools"
			:ctdbHosts="ctdbHosts"
			:parentProcessing="processing"
			@appendShareToList="share => shares = [...shares, share].sort((a, b) => a.name.localeCompare(b.name))"
			@removeShareFromList="share => shares = shares.filter((a) => a !== share)"
		/>
		<div class="card">
			<div class="card-header flex flex-row space-x-2 items-center">
				<div class="text-header">Import/Export Config</div>
				<LoadingSpinner
					v-if="processing"
					class="size-icon"
				/>
			</div>
			<div class="card-body button-group-row">
				<input
					@change="importConfigUploadCallback"
					type="file"
					id="file-upload"
					hidden
				/>
				<button
					@click="uploadConfig"
					class="btn btn-primary"
				>Import</button>
				<button
					@click="exportConfig"
					class="btn btn-primary"
				>Export</button>
				<div class="flex items-center">
					<button
						@click="importSmbConf"
						class="btn btn-secondary"
					>
						Import configuration from <span class="text-sm font-mono">/etc/samba/smb.conf</span>
					</button>
					<InfoTip above>
						File Sharing uses Samba's net registry to configure shares. Click this button to import
						configuration from <span class="text-sm font-mono">/etc/samba/smb.conf</span> into the net
						registry for management.
					</InfoTip>
				</div>
			</div>
		</div>
	</div>
	<ModalPopup
		:showModal="confirmationModal.showModal"
		@apply="confirmationModal.applyCallback"
		@cancel="confirmationModal.cancelCallback"
		applyDangerous
		applyText="Yes"
		:headerText="confirmationModal.headerText"
	>
		<template #icon>
			<ExclamationCircleIcon
				v-if="confirmationModal.showIcon"
				class="size-icon-xl icon-danger shrink-0"
			/>
		</template>
		<div
			class="whitespace-pre-wrap"
			v-html="confirmationModal.bodyText"
		/>
	</ModalPopup>
</template>

<script>
import { XCircleIcon, ExclamationCircleIcon } from "@heroicons/vue/solid";
import SambaShareManagement from "./SambaShareManagement.vue";
import SambaGlobalManagement from "./SambaGlobalManagement.vue";
import { useSpawn, errorString, errorStringHTML, processOutputDownload } from "@45drives/cockpit-helpers";
import { ref, reactive, watch, inject, onBeforeUnmount } from "vue";
import LoadingSpinner from "./LoadingSpinner.vue";
import { notificationsInjectionKey, usersInjectionKey, groupsInjectionKey } from "../keys";
import ModalPopup from "./ModalPopup.vue";
import InfoTip from "./InfoTip.vue";

export default {
	setup(props, ctx) {
		const shares = ref([]);
		const globalConfig = reactive({ advancedSettings: [] });
		const users = inject(usersInjectionKey);
		const groups = inject(groupsInjectionKey);
		const ctdbHosts = ref([]);
		const cephLayoutPools = ref([]);
		const processing = ref(0);
		const notifications = inject(notificationsInjectionKey);
		const confirmationModal = reactive({
			showModal: false,
			headerText: "",
			bodyText: "",
			showIcon: true,
			ask: (header, body, showIcon = true) => {
				confirmationModal.showModal = true;
				confirmationModal.headerText = header;
				confirmationModal.bodyText = body;
				confirmationModal.showIcon = showIcon;
				return new Promise((resolve, reject) => {
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

		const checkConf = async () => {
			processing.value++;
			try {
				const smbConfFile = cockpit.file("/etc/samba/smb.conf", { superuser: 'try' });
				const smbConf = await smbConfFile.read();
				smbConfFile.close();
				const globalSectionText = smbConf.match(/^\s*\[ ?global ?\].*$(?:\n^(?!\s*\[).*$)*/mi)?.[0];
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
							await useSpawn(['smbcontrol', 'all', 'reload-config'], { superuser: 'try' }).promise();
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
				const cephFsStatus = JSON.parse((await useSpawn([
					'ceph',
					'fs',
					'status',
					'--keyring=/etc/ceph/ceph.client.samba.keyring',
					'-n',
					'client.samba',
					'--format=json',
				], { superuser: 'try' }).promise()).stdout);
				cephLayoutPools.value = cephFsStatus.pools
					.filter(pool => pool.type === 'data')
					.map(pool => pool.name);
			} catch {
				try {
					const cephFsStatus = JSON.parse((await useSpawn([
						'ceph', 'fs', 'status', '--format=json'
					], { superuser: 'try' }).promise()).stdout);
					cephLayoutPools.value = cephFsStatus.pools
						.filter(pool => pool.type === 'data')
						.map(pool => pool.name);
				} catch { /* assuming not ceph */ }
			}
		}

		const refresh = async () => {
			processing.value++;
			try {
				const procs = [];
				procs.push(parseNetConf().then(() => shares.value.sort((a, b) => a.name.localeCompare(b.name))));
				procs.push(checkConf());
				procs.push(getCtdbHosts());
				procs.push(getCephLayoutPools());
				await Promise.all(procs);
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

		const importConfigUploadCallback = (event) => {
			const file = event.target.files[0];
			let reader = new FileReader();
			reader.onload = async (event) => {
				const content = event.target.result;
				importConfig(content);
				processing.value--;
			}
			reader.onerror = (event) => {
				notifications.value.constructNotification("Failed to import config", "Error reading file on client side", 'error');
				processing.value--;
			}
			processing.value++;
			reader.readAsText(file);
		}

		const importSmbConf = async () => {
			const testContent = (await useSpawn(['net', 'conf', 'import', '-T', '/etc/samba/smb.conf'], { superuser: 'try' }).promise()).stdout;
			if (!await confirmationModal.ask(
				"This will permanently overwrite current configuration",
				"New configuration content:\n" +
				'<span class="text-sm font-mono whitespace-pre">\n' +
				testContent
					.replace(/^TEST MODE.*$\n/m, '')
					.replace(/^[ \t]*(include|config backend)[ \t]*=[ \t]*registry.*$\n?/mi, '')
					.trim() + '\n' +
				'</span>\n' +
				"Are you sure?"
			))
				return;
			try {
				processing.value++;
				const smbConfFile = cockpit.file("/etc/samba/smb.conf", { superuser: 'try' });
				const smbConf = await smbConfFile.read();
				smbConfFile.close();
				await importConfig(smbConf);
			} catch (error) {
				notifications.value.constructNotification("Failed to read /etc/samba/smb.conf", errorStringHTML(error), 'error');
				return;
			} finally {
				processing.value--;
			}
			await new Promise(resolve => setTimeout(resolve, 300)); // temporary hack until modals are fixed
			if (await confirmationModal.ask(
				'Replace smb.conf to avoid conflicts?',
				'Your original <span class="text-sm font-mono">/etc/samba/smb.conf</span> ' +
				'will be backed up ' +
				'to <span class="text-sm font-mono">/etc/samba/smb.conf.bak</span> and replaced with\n' +
				'<span class="text-sm font-mono whitespace-pre">\n' +
				'[global]\n' +
				'	include = registry\n' +
				'</span>\n' +
				'to avoid any conflicting share definitions.',
				false
			)) {
				try {
					const backupDescription = (await useSpawn(['cp', '-v', '--backup=numbered', '/etc/samba/smb.conf', '/etc/samba/smb.conf.bak'], { superuser: 'try' }).promise()).stdout;
					notifications.value.constructNotification("Backed up original smb.conf", backupDescription.trim(), 'info');
					try {
						await cockpit.file('/etc/samba/smb.conf', { superuser: 'try' }).replace(
							'# this config was generated by cockpit-file-sharing after importing smb.conf\n' +
							`# original smb.conf location:\n` +
							backupDescription.replace(/^/m, '# ') +
							'[global]\n' +
							'	include = registry\n');
						await useSpawn(['smbcontrol', 'all', 'reload-config'], { superuser: 'try' }).promise();
					} catch (error) {
						notifications.value.constructNotification("Failed to replace contents of /etc/samba/smb.conf", errorStringHTML(error), 'error');
						return;
					}
				} catch (error) {
					notifications.value.constructNotification("Failed to back up /etc/samba/smb.conf", "Original config is unmodified.\n" + errorStringHTML(error), 'error');
					return;
				}
			}
		}

		/**
		 * Import configuration from string, filters out `include = registry` and `config backend = registry`
		 * @param {string} content - New config content in smb.conf format
		 */
		const importConfig = async (content) => {
			let tmpFile;
			try {
				processing.value++;
				// const state = useSpawn(['net', 'conf', 'import', '/dev/stdin'], { superuser: 'try' });
				// state.proc.input(content.replace(/^[ \t]*(include|config backend)[ \t]*=[ \t]*registry.*$\n?/mi, ''));
				// await state.promise();
				tmpFile = (await useSpawn(['mktemp'], { superuser: 'try' }).promise()).stdout;
				// could use cockpit.file here, but easier to use useSpawn with dd to
				// catch the state object if there are any errors
				const writerState = useSpawn(['dd', `of=${tmpFile}`], { superuser: 'try' });
				writerState.proc.input(content.replace(/^[ \t]*(include|config backend)[ \t]*=[ \t]*registry.*$\n?/mi, ''));
				await writerState.promise();
				await useSpawn(['net', 'conf', 'import', tmpFile], { superuser: 'try' }).promise();
				await refresh();
				notifications.value.constructNotification("Success", "Imported configuration succefully.", 'success');
			} catch (state) {
				notifications.value.constructNotification("Failed to import config", errorStringHTML(state), 'error');
			} finally {
				if (tmpFile)
					useSpawn(['rm', '-f', tmpFile], { superuser: 'try' });
				processing.value--;
			}
		}

		const exportConfig = async () => {
			const backendPath = "/tmp/cockpit-file-sharing_samba_exported.conf";
			const date = new Date();
			const filename = `cockpit-file-sharing_samba_exported_${date.toISOString().replace(/:/g, '-').replace(/T/, '_')}.conf`;
			processOutputDownload(['net', 'conf', 'list'], filename, { superuser: 'try' });
		}

		const watchHandles = [];

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
			refresh,
			uploadConfig,
			importConfigUploadCallback,
			importSmbConf,
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
		InfoTip,
	}
}
</script>
