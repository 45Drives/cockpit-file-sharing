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
		<div class="card">
			<div class="card-header flex flex-row items-center gap-2">
				<div class="text-header">Shares</div>
				<LoadingSpinner
					v-if="processing"
					class="size-icon"
				/>
			</div>
			<div
				class="overflow-hidden"
				:style="{ 'max-height': showAddShare ? '1500px' : '0', transition: showAddShare ? 'max-height 0.5s ease-in' : 'max-height 0.5s ease-out' }"
			>
				<div class="card-body">
					<NfsShareEditor
						@update-share="addShare"
						@hide="showAddShare = false"
						:users="users"
						:groups="groups"
						:shares="shares"
						:corosyncHosts="corosyncHosts"
						:cephLayoutPools="cephLayoutPools"
					/>
				</div>
			</div>
			<div :class="[showAddShare ? '' : '!border-t-0', 'card-body p-0 sm:p-6']">
				<div class="sm:shadow sm:rounded-lg sm:border sm:border-default overflow-hidden">
					<Table
						emptyText="No shares. Click '+' to add one."
						shrinkHeight
						noScroll
						noHeader
						class="!border-none !shadow-none"
					>
						<template #thead>
							<tr>
								<th scope="col">Path</th>
								<th
									scope="col"
									class="flex flex-row justify-end"
								>
									<span class="sr-only">Edit/Delete</span>
									<button @click="showAddShare = !showAddShare">
										<PlusIcon class="size-icon icon-default" />
									</button>
								</th>
							</tr>
						</template>
						<template #tbody>
							<NfsShare
								v-for="(share, index) in shares"
								:key="index"
								:share="shares[index]"
								:index="index"
								@delete-share="deleteShare"
								@update-share="updateShare"
								:users="users"
								:groups="groups"
								:shares="shares"
								:corosyncHosts="corosyncHosts"
								:cephLayoutPools="cephLayoutPools"
							/>
						</template>
					</Table>
				</div>
			</div>
		</div>
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
					@change="importConfig"
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
			<ExclamationCircleIcon class="size-icon-xl icon-danger shrink-0" />
		</template>
		{{ confirmationModal.bodyText }}
	</ModalPopup>
</template>

<script>
import NfsShare from "./NfsShare.vue";
import NfsShareEditor from "./NfsShareEditor.vue";
import { PlusIcon, XCircleIcon, ExclamationCircleIcon } from "@heroicons/vue/solid";
import LoadingSpinner from "./LoadingSpinner.vue";
import { ref, reactive, inject, onBeforeUnmount, watch } from "vue";
import { NfsExportSyntax } from "../NFSExportsSyntax";
import { useSpawn, errorString, errorStringHTML, fileDownload } from "@45drives/cockpit-helpers";
import Table from "./Table.vue";
import { notificationsInjectionKey, usersInjectionKey, groupsInjectionKey } from "../keys";
import ModalPopup from "./ModalPopup.vue";
import { useConfig } from "./Config.vue";
import { getCephLayoutPools } from "../functions";

export default {
	setup() {
		const config = useConfig();
		const shares = ref([]);
		const processing = ref(0);
		const showAddShare = ref(false);
		const users = inject(usersInjectionKey);
		const groups = inject(groupsInjectionKey);
		const corosyncHosts = ref([]);
		const cephLayoutPools = ref([]);
		const notifications = inject(notificationsInjectionKey);
		let exportsFile = null;
		let exportsFiles = [];
		let exportsFileWatchHandles = [];

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

		const loadShares = (sharesOnDisk) => {
			processing.value++;
			try {
				shares.value = sharesOnDisk?.sort((a, b) => a.path.localeCompare(b.path)) ?? [];
			} catch (error) {
				notifications.value.constructNotification("Failed to load share configuration", errorStringHTML(error), 'error', 0);
			} finally {
				processing.value--;
			}
		};

		const getCorosyncHosts = async () => {
			try {
				// const pcsConfig = await useSpawn(['pcs', 'cluster', 'config', 'show', '--output-format', 'json'], { superuser: 'try' }).promise();
				// corosyncHosts.value = JSON.parse(pcsConfig.stdout.trim()).nodes.map(node => node.addrs[0].addr);
				const pcsAddrs = await useSpawn(['bash', '-c', "cat /etc/corosync/corosync.conf | grep 'ring0_addr' | awk -F: '{print $2}'"], { superuser: 'try' }).promise();

				if (pcsAddrs.stdout?.trim()) {
					corosyncHosts.value = pcsAddrs.stdout.split('\n').map(ip => ip.trim()).filter(ip => ip);
					console.log(corosyncHosts.value);
				}
			} catch { /* not using corosync */ }
		};

		const writeExportsFile = async () => {
			try {
				const filePath = config.nfs.confPath;
				if (filePath[0] !== '/')
					throw new Error('NFS Exports path must be absolute.');
				const parentDir = filePath.split('/').slice(0, -1).join('/') || '/';
				if (corosyncHosts.value.length > 0) {
					for (let i = 0; i < corosyncHosts.value.length; i++) {
						const host = corosyncHosts.value[i];

						await useSpawn(['mkdir', '-p', parentDir], { superuser: 'try', host, }).promise();
					}

					await Promise.all(exportsFiles.map(exportsFile => exportsFile.replace(shares.value)));
				} else {
					await useSpawn(['mkdir', '-p', parentDir], { superuser: 'try' }).promise();
					// await exportsFile.replace(shares.value);
					await Promise.all(exportsFiles.map(exportsFile => exportsFile.replace(shares.value)));
				}
			} catch (error) {
				error.message = `Failed to write exports file: ${errorString(error.message)}`;
				throw error;
			}
		}

		const validateExportsFile = async () => {
			try {
				if (corosyncHosts.value.length > 0) {
					for (let i = 0; i < corosyncHosts.value.length; i++) {
						const host = corosyncHosts.value[i];

						await useSpawn(['exportfs', '-ra'], { superuser: 'try', host }).promise();
					}
				} else {
					await useSpawn(['exportfs', '-ra'], { superuser: 'try' }).promise();
				}
			} catch (error) {
				error.message = `Failed to validate exports file: ${errorString(error)}`;
				throw error;
			}
		}

		const updateShare = async (share, newShare) => {
			const oldShare = {};
			const rollback = [...shares.value];
			processing.value++;
			try {
				if (share) {
					Object.assign(oldShare, share);
					Object.assign(share, newShare);
				} else {
					shares.value = [...shares.value, { ...newShare }];
				}
				await writeExportsFile();
				await validateExportsFile();
				notifications.value.constructNotification(`Successfully ${share === null ? 'added' : 'updated'} share`, "", 'success');
			} catch (error) {
				notifications.value.constructNotification("Failed to update shares", errorStringHTML(error), 'error');
				if (share) {
					Object.assign(share, oldShare);
				} else {
					shares.value = rollback;
				}
				try {
					await writeExportsFile();
				} catch (error) {
					notifications.value.constructNotification("Failed to revert exports file", errorStringHTML(error), 'error');
				}
			} finally {
				processing.value--;
			}
		}

		const addShare = async (newShare) => {
			updateShare(null, newShare);
		}

		const deleteShare = async (share) => {
			// if (!await confirmationModal.ask(`Permanently delete share for "${share.path}"?`, "This cannot be undone."))
			// 	return;
			try {
				shares.value = shares.value.filter((testShare) => share !== testShare);
				await writeExportsFile();
				notifications.value.constructNotification(`Successfully deleted share`, "", 'success');
			} catch (error) {
				notifications.value.constructNotification("Failed to delete share", errorStringHTML(error), 'error');
			}
		}

		const uploadConfig = async () => {
			if (!await confirmationModal.ask("This will permanently overwrite current configuration", "Are you sure?"))
				return;
			document.getElementById("file-upload").click();
		}

		const importConfig = (event) => {
			const file = event.target.files[0];
			let reader = new FileReader();
			reader.onload = async (event) => {
				const content = event.target.result;
				let oldShares = shares.value.map((share) => { return { ...share } });
				try {
					shares.value = NfsExportSyntax.parse(content);
					await writeExportsFile();
					notifications.value.constructNotification(`Successfully imported configuration`, "", 'success');
				} catch (error) {
					notifications.value.constructNotification("Failed to import config", errorStringHTML(error), 'error');
					shares.value = oldShares;
				}
				processing.value--;
			}
			reader.onerror = (event) => {
				notifications.value.constructNotification("Failed to import config", "Error reading file on client side", 'error');
				processing.value--;
			}
			processing.value++;
			reader.readAsText(file);
		}

		const exportConfig = () => {
			const date = new Date();
			const filename = `cockpit-file-sharing_nfs_exported_${date.toISOString().replace(/:/g, '-').replace(/T/, '_')}.exports`;
			fileDownload(exportsFile.path, filename);
		}

		watch([() => config.nfs.confPath, corosyncHosts], async () => {
			await exportsFileWatchHandles.map(exportsFileWatchHandle => exportsFileWatchHandle?.remove?.());

			exportsFiles = [];
			exportsFileWatchHandles = [];

			exportsFile = cockpit.file(config.nfs.confPath, { superuser: 'try', syntax: NfsExportSyntax });

			if (corosyncHosts.value.length > 0) {
				for (let i = 0; i < corosyncHosts.value.length; i++) {
					const host = corosyncHosts.value[i];

					exportsFiles[i] = cockpit.file(config.nfs.confPath, { superuser: 'try', syntax: NfsExportSyntax, host, });

					exportsFileWatchHandles[i] = [exportsFiles[i].watch(loadShares)];
				}
			} else {
				exportsFiles[0] = cockpit.file(config.nfs.confPath, { superuser: 'try', syntax: NfsExportSyntax });
				exportsFileWatchHandles[0] = exportsFiles[0].watch(loadShares);
			}
		}, { immediate: true, deep: true });

		getCephLayoutPools('client.nfs')
			.then(pools => {
				cephLayoutPools.value = pools;
			});

		const watchHandles = [];

		watchHandles.push(cockpit.file('/etc/corosync/corosync.conf', { superuser: 'try' }).watch(() => getCorosyncHosts(), { read: false }));

		onBeforeUnmount(() => watchHandles.map(handle => handle?.remove?.()));

		return {
			shares,
			processing,
			showAddShare,
			users,
			groups,
			corosyncHosts,
			cephLayoutPools,
			confirmationModal,
			loadShares,
			updateShare,
			addShare,
			deleteShare,
			uploadConfig,
			importConfig,
			exportConfig,
		}
	},
	components: {
		NfsShare,
		NfsShareEditor,
		PlusIcon,
		LoadingSpinner,
		XCircleIcon,
		Table,
		ModalPopup,
		ExclamationCircleIcon,
	}
}
</script>
