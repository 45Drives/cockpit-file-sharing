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
		<div class="card">
			<div class="card-header flex flex-row items-center gap-2">
				<div class="text-header">Shares</div>
				<LoadingSpinner v-if="processing" class="size-icon" />
			</div>
			<div :class="['card-body', showAddShare ? 'space-y-content' : '']">
				<div
					class="overflow-hidden"
					:style="{ 'max-height': showAddShare ? '1500px' : '0', transition: showAddShare ? 'max-height 0.5s ease-in' : 'max-height 0.5s ease-out' }"
				>
					<NfsShareEditor
						@update-share="addShare"
						@hide="showAddShare = false"
						:users="users"
						:groups="groups"
					/>
				</div>
				<Table emptyText="No shares. Click '+' to add one." shrinkHeight noScroll noHeader>
					<!-- <template #header>
						<div class="flex flex-row space-x-2 items-center">
							<div>NFS Shares</div>
							<LoadingSpinner v-if="processing" class="size-icon" />
							<div class="grow"></div>
							<button @click="showAddShare = !showAddShare">
								<PlusIcon class="size-icon icon-default cursor-pointer" />
							</button>
						</div>
					</template> -->
					<template #thead>
						<tr>
							<th scope="col">Path</th>
							<th scope="col" class="flex flex-row justify-end">
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
						/>
					</template>
				</Table>
			</div>
		</div>
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
	<ModalPopup
		:showModal="confirmationModal.showModal"
		@apply="confirmationModal.applyCallback"
		@cancel="confirmationModal.cancelCallback"
		applyDangerous
		applyText="Yes"
		:headerText="confirmationModal.headerText"
	>
		<template #icon>
			<ExclamationCircleIcon class="size-icon-xl icon-danger" />
		</template>
		{{ confirmationModal.bodyText }}
	</ModalPopup>
</template>

<script>
import NfsShare from "./NfsShare.vue";
import NfsShareEditor from "./NfsShareEditor.vue";
import { PlusIcon, XCircleIcon, ExclamationCircleIcon } from "@heroicons/vue/solid";
import LoadingSpinner from "./LoadingSpinner.vue";
import { ref, reactive, inject } from "vue";
import { NfsExportSyntax } from "@45drives/cockpit-syntaxes";
import { useSpawn, errorString, errorStringHTML } from "@45drives/cockpit-helpers";
import { getUsers, getGroups } from "../functions";
import Table from "./Table.vue";
import { notificationsInjectionKey } from "../keys";
import ModalPopup from "./ModalPopup.vue";

export default {
	setup(props) {
		const shares = ref([]);
		const processing = ref(0);
		const showAddShare = ref(false);
		const exportsFile = reactive(cockpit.file("/etc/exports.d/cockpit-file-sharing.exports", { superuser: 'try', syntax: NfsExportSyntax }));
		const users = ref([]);
		const groups = ref([]);
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

		const loadShares = async () => {
			processing.value++;
			try {
				shares.value = await exportsFile.read() ?? [];
				shares.value.sort((a, b) => a.path.localeCompare(b.path));
			} catch (error) {
				notifications.value.constructNotification("Failed to load share configuration", errorStringHTML(error), 'error', 0);
			} finally {
				processing.value--;
			}
		};

		const getUserList = async () => {
			processing.value++;
			try {
				users.value = await getUsers(false);
			} catch (error) {
				notifications.value.constructNotification("Failed to get users", errorStringHTML(error), 'error', 0);
			} finally {
				processing.value--;
			}
		}

		const getGroupList = async () => {
			processing.value++;
			try {
				groups.value = await getGroups(false);
			} catch (error) {
				notifications.value.constructNotification("Failed to get groups", errorStringHTML(error), 'error', 0);
			} finally {
				processing.value--;
			}
		}

		const init = async () => {
			const procs = [];
			procs.push(loadShares());
			procs.push(getUserList());
			procs.push(getGroupList());
			for (let proc of procs)
				await proc;
		};

		init();

		const writeExportsFile = async () => {
			try {
				await exportsFile.replace(shares.value);
			} catch (error) {
				error.message = `Failed to write exports file: ${errorString(error.message)}`;
				throw error;
			}
		}

		const validateExportsFile = async () => {
			try {
				await useSpawn(['exportfs', '-ra'], { superuser: 'try' }).promise();
			} catch (error) {
				error.message = `Failed to validate exports file: ${errorString(error)}`;
				throw error;
			}
		}

		const updateShare = async (share, newShare) => {
			const oldShare = {};
			processing.value++;
			try {
				if (share) {
					Object.assign(oldShare, share);
					Object.assign(share, newShare);
				} else {
					shares.value.push({ ...newShare });
				}
				await writeExportsFile();
				await validateExportsFile();
				notifications.value.constructNotification(`Successfully ${share === null ? 'added' : 'updated'} share`, "", 'success');
			} catch (error) {
				notifications.value.constructNotification("Failed to update shares", errorStringHTML(error), 'error');
				if (share) {
					Object.assign(share, oldShare);
				} else {
					shares.value.pop();
				}
				try {
					await writeExportsFile();
				} catch (error) {
					notifications.value.constructNotification("Failed to revert exports file", errorStringHTML(error), 'error');
				}
			} finally {
				shares.value.sort((a, b) => a.path.localeCompare(b.path));
				processing.value--;
			}
		}

		const addShare = async (newShare) => {
			updateShare(null, newShare);
		}

		const deleteShare = async (share) => {
			if (!await confirmationModal.ask(`Permanently delete share for "${share.path}"?`, "This cannot be undone."))
				return;
			try {
				shares.value = shares.value.filter((testShare) => share !== testShare);
				await writeExportsFile();
				notifications.value.constructNotification(`Successfully deleted share`, "", 'success');
			} catch (error) {
				notifications.value.constructNotification("Failed to delete share", errorStringHTML(error), 'error');
				loadShares();
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
				shares.value.sort((a, b) => a.path.localeCompare(b.path));
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
			let query = window.btoa(JSON.stringify({
				payload: 'fsread1',
				binary: 'raw',
				path: exportsFile.path,
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
			processing,
			showAddShare,
			users,
			groups,
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
