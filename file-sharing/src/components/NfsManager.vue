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
			<div class="card-header flex flex-row space-x-3">
				<h3 class="text-lg leading-6 font-medium">NFS Shares</h3>
				<LoadingSpinner v-if="!loaded" class="w-5 h-5" />
			</div>
			<div class="card-body">
				<div
					class="overflow-hidden px-5"
					:style="{ 'max-height': showAddShare ? '1500px' : '0', transition: showAddShare ? 'max-height 0.5s ease-in' : 'max-height 0.5s ease-out' }"
				>
					<NfsShareEditor
						@update-share="addShare"
						@hide="showAddShare = false"
						:users="users"
						:groups="groups"
					/>
				</div>
				<div class="flex flex-col">
					<div class="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
						<div class="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
							<div
								class="overflow-hidden shadow ring-1 ring-black ring-opacity-5 dark:ring-gray-700 md:rounded-lg"
							>
								<table class="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
									<thead class="bg-neutral-50 dark:bg-neutral-800">
										<tr>
											<th scope="col" class="py-3.5 pl-4 pr-3 text-left text-sm font-semibold sm:pl-6 lg:pl-8">Path</th>
											<th scope="col" class="relative py-3.5 pl-3 pr-4 sm:pr-6 lg:pr-8">
												<span class="sr-only">Edit</span>
											</th>
											<th scope="col" class="relative py-3.5 pl-3 pr-4 sm:pr-6 lg:pr-8">
												<span class="sr-only">Delete</span>
											</th>
											<div class="relative">
												<PlusIcon
													@click="showAddShare = true"
													class="w-5 h-5 absolute right-3 top-3.5 cursor-pointer text-gray-500"
												/>
											</div>
										</tr>
									</thead>
									<tbody class="bg-white dark:bg-neutral-800">
										<NfsShare
											v-for="(share, index) in shares"
											:share="shares[index]"
											:index="index"
											@delete-share="deleteShare"
											@update-share="updateShare"
											:users="users"
											:groups="groups"
										/>
										<tr v-if="shares.length === 0">
											<td
												colspan="3"
												class="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-500 sm:pl-6 lg:pl-8"
											>No shares. Click "+" to add one.</td>
										</tr>
									</tbody>
								</table>
							</div>
						</div>
					</div>
				</div>
			</div>
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
import NfsShare from "./NfsShare.vue";
import NfsShareEditor from "./NfsShareEditor.vue";
import { PlusIcon, XCircleIcon } from "@heroicons/vue/solid";
import LoadingSpinner from "./LoadingSpinner.vue";
import { ref, reactive } from "vue";
import { NfsExportSyntax } from "./NfsExportSyntax";
import useSpawn from "./UseSpawn";
import { getUsers, getGroups } from "../functions";
export default {
	props: {
		modalPopup: Object,
	},
	setup(props) {
		const fatalError = ref("");
		const shares = ref([]);
		const loaded = ref(false);
		const showAddShare = ref(false);
		const exportsFile = reactive(cockpit.file("/etc/exports.d/cockpit-file-sharing.exports", { superuser: 'try', syntax: NfsExportSyntax }));
		const users = ref([]);
		const groups = ref([]);

		const loadShares = async () => {
			shares.value = [];
			try {
				shares.value = await exportsFile.read() ?? [];
			} catch (err) {
				fatalError.value += "Failed to load share configuration: " + err.message;
			}
			shares.value.sort((a, b) => a.path.localeCompare(b.path));
		};

		const getUserList = async () => {
			users.value = [];
			try {
				users.value = await getUsers(false);
			} catch (error) {
				fatalError.value += error.message + '\n';
			}
		}

		const getGroupList = async () => {
			groups.value = [];
			try {
				groups.value = await getGroups(false);
			} catch (error) {
				fatalError.value += error.message + '\n';
			}
		}

		const init = async () => {
			const procs = [];
			procs.push(loadShares());
			procs.push(getUserList());
			procs.push(getGroupList());
			for (let proc of procs)
				await proc;
			loaded.value = true;
		};

		init();

		const writeExports = async () => {
			await exportsFile.replace(shares.value);
			try {
				await useSpawn(['exportfs', '-ra'], { superuser: 'try' }).promise();
			} catch (state) {
				throw new Error(state.stderr);
			}
		}

		const updateShare = async (share, newShare) => {
			const oldShare = {};
			try {
				if (share) {
					Object.assign(oldShare, share);
					Object.assign(share, newShare);
				} else {
					shares.value.push({ ...newShare });
				}
				await writeExports();
			} catch (error) {
				await props.modalPopup.alert("Failed to update shares", error.message, { icon: 'danger' });
				if (share) {
					Object.assign(share, oldShare);
				} else {
					shares.value.pop();
				}
				await writeExports();
			}
			shares.value.sort((a, b) => a.path.localeCompare(b.path));
		}

		const addShare = async (newShare) => {
			updateShare(null, newShare);
		}

		const deleteShare = async (share) => {
			if (!await props.modalPopup.confirm(`Permanently delete share for "${share.path}"?`, "This cannot be undone.", { icon: 'danger' }))
				return;
			try {
				shares.value = shares.value.filter((testShare) => share !== testShare);
				await writeExports();
			} catch (error) {
				await props.modalPopup.alert("Failed to delete share", error.message, { icon: 'danger' });
				loadShares();
			}
		}

		const uploadConfig = async () => {
			if (!await props.modalPopup.confirm(
				"This will permanently overwrite current configuration. Are you sure?",
				"",
				{ icon: 'danger' }
			))
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
					await writeExports();
				} catch (err) {
					await props.modalPopup.alert("Failed to import config", err.message, { icon: 'danger' });
					shares.value = oldShares;
				}
			}
			shares.value.sort((a, b) => a.path.localeCompare(b.path));
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
			fatalError,
			shares,
			loaded,
			showAddShare,
			users,
			groups,
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
	}
}
</script>
