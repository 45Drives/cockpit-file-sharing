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
	<div class="space-y-content py-2">
		<div class="text-header" v-if="!share">New Share</div>
		<div>
			<label class="block text-label">Share Path</label>
			<input
				type="text"
				name="path"
				class="w-full input-textlike"
				placeholder="Share Path"
				v-model="tmpShare.path"
			/>
			<div class="feedback-group" v-if="feedback.path">
				<ExclamationCircleIcon class="size-icon icon-error" />
				<span class="text-feedback text-error">{{ feedback.path }}</span>
			</div>
			<div class="feedback-group" v-else>
				<ExclamationIcon v-if="!pathExists" class="size-icon icon-warning" />
				<span v-if="!pathExists" class="text-feedback text-warning">Path does not exist.</span>
				<button
					v-if="!pathExists"
					class="text-feedback text-warning underline"
					@click="dirPermissions.update"
				>Create now</button>
				<button v-else class="text-feedback text-primary" @click="dirPermissions.update">Edit Permissions</button>
			</div>
		</div>
		<ModalPopup
			:showModal="dirPermissions.showModal"
			headerText="Share Directory Permissions"
			@apply="dirPermissions.applyCallback"
			@cancel="dirPermissions.cancelCallback"
		>
			<div class="flex flex-col space-y-content">
				<FileModeMatrix v-model="dirPermissions.mode" />
				<div>
					<label class="block text-sm font-medium">Owner</label>
					<select name="log-level" class="input-textlike" v-model="dirPermissions.owner">
						<option v-for="user in users" :value="user.user">{{ user.pretty }}</option>
					</select>
				</div>
				<div>
					<label class="block text-sm font-medium">Group</label>
					<select name="log-level" class="input-textlike" v-model="dirPermissions.group">
						<option v-for="group in groups" :value="group.group">{{ group.pretty }}</option>
					</select>
				</div>
			</div>
		</ModalPopup>
		<Table shrinkHeight noScroll>
			<template #header>
				<div class="flex flex-row items-center justify-between">
					<div>Clients</div>
					<PlusIcon @click="addClient" class="size-icon icon-default cursor-pointer" />
				</div>
			</template>
			<template #thead>
				<tr>
					<th scope="col">Host</th>
					<th scope="col">Settings</th>
					<th scope="col">
						<span class="sr-only">Remove client</span>
					</th>
				</tr>
			</template>
			<template #tbody>
				<tr
					v-for="(client, index) in tmpShare.clients"
					:class="index % 2 === 0 ? undefined : 'bg-neutral-50 dark:bg-neutral-700'"
				>
					<td class="w-1/4">
						<input type="text" class="w-full input-textlike" v-model="client.host" />
					</td>
					<td class="w-3/4">
						<input type="text" class="w-full input-textlike" v-model="client.settings" />
					</td>
					<td class="flex flex-row justify-end items-center align-middle">
						<button v-if="tmpShare.clients.length > 1" @click="deleteClient(client)">
							<span class="sr-only">Remove client {{ client }}</span>
							<MinusIcon class="size-icon icon-danger cursor-pointer" />
						</button>
					</td>
				</tr>
			</template>
		</Table>
		<div class="button-group-row w-full justify-end">
			<button class="btn btn-secondary" @click="cancel">Cancel</button>
			<button class="btn btn-primary" @click="apply" :disabled="!inputsValid">Apply</button>
		</div>
	</div>
</template>

<script>
import { inject, reactive, ref, watch } from "vue";
import { PlusIcon, MinusIcon, ExclamationCircleIcon, ExclamationIcon } from "@heroicons/vue/solid";
import { useSpawn, errorStringHTML } from "@45drives/cockpit-helpers";
import ModalPopup from "./ModalPopup.vue";
import { notificationsInjectionKey } from "../keys";
import FileModeMatrix from "./FileModeMatrix.vue";
import Table from "./Table.vue";

const clientTemplate = {
	host: "*",
	settings: "rw,sync,no_subtree_check"
}

const shareTemplate = {
	path: "",
	clients: [clientTemplate],
}

export default {
	props: {
		share: {
			type: Object,
			required: false,
			default: null
		},
		users: Array[Object],
		groups: Array[Object],
	},
	setup(props, { emit }) {
		const pathExists = ref(false);
		const inputsValid = ref(false);
		const tmpShare = reactive({});
		const feedback = reactive({});
		const notifications = inject(notificationsInjectionKey);

		const dirPermissions = reactive({
			showModal: false,
			mode: 0o755,
			owner: 'root',
			group: 'root',
			resetNewDirSettings: async () => {
				try {
					const stat = (await useSpawn(['stat', '--format=%a:%U:%G', tmpShare.path], { superuser: 'try' }).promise()).stdout.trim().split(':');
					dirPermissions.mode = parseInt(stat[0], 8);
					dirPermissions.owner = stat[1];
					dirPermissions.group = stat[2];
				} catch (state) {
					dirPermissions.mode = 0o755;
					dirPermissions.owner = 'root';
					dirPermissions.group = 'root';
				}
			},
			update: async () => {
				try {
					if (/^(?:\/\.?\.?)+$/.test(tmpShare.path)) {
						notifications.value.constructNotification("Cannot Edit Permissions for /", "If you think you need to do this, you don't.", 'denied');
						return;
					}
					await dirPermissions.resetNewDirSettings();
					if (!await dirPermissions.waitForApply())
						return;
					await useSpawn(['mkdir', '-p', tmpShare.path], { superuser: 'try' }).promise();
					await useSpawn(['chown', dirPermissions.owner, tmpShare.path], { superuser: 'try' }).promise();
					await useSpawn(['chgrp', dirPermissions.group, tmpShare.path], { superuser: 'try' }).promise();
					await useSpawn(['chmod', dirPermissions.mode.toString(8), tmpShare.path], { superuser: 'try' }).promise();
					await checkIfExists();
				} catch (state) {
					notifications.value.constructNotification("Failed to update directory permissions", errorStringHTML(state), 'error');
				}
			},
			waitForApply: () => {
				return new Promise((resolve, reject) => {
					dirPermissions.showModal = true;
					const respond = (result) => {
						dirPermissions.showModal = false;
						resolve(result);
					}
					dirPermissions.applyCallback = () => respond(true);
					dirPermissions.cancelCallback = () => respond(false);
				});
			},
			applyCallback: () => { },
			cancelCallback: () => {
				dirPermissions.showModal = false;
			}
		});

		const tmpShareInit = () => {
			Object.assign(tmpShare, props?.share
				? {
					...props.share,
					clients: [...props.share.clients.map((client) => { return { ...client } })],
				}
				: {
					...shareTemplate,
					clients: [...shareTemplate.clients.map((client) => { return { ...client } })]
				})
		}

		tmpShareInit();

		const apply = () => {
			tmpShare.path = tmpShare.path.trim();
			for (const client of tmpShare.clients) {
				client.host = client.host.replace(/\s+/, '');
				client.settings = client.settings.replace(/\s+/, '');
			}
			emit('updateShare', tmpShare);
			tmpShareInit();
			emit('hide');
		}

		const cancel = () => {
			tmpShareInit();
			emit('hide');
		}

		const addClient = () => {
			tmpShare.clients.push({ ...clientTemplate });
		}

		const deleteClient = (toRemove) => {
			tmpShare.clients = tmpShare.clients.filter((client) => client !== toRemove);
		}

		const checkIfExists = async () => {
			try {
				await useSpawn(['ls', tmpShare.path], { superuser: 'try' }).promise();
				pathExists.value = true;
				return;
			} catch { }
			pathExists.value = false;
		};

		const validateInputs = () => {
			let result = true;
			if (!tmpShare.path) {
				feedback.path = "Share path is required.";
				result = false;
			} else if (!/^\//.test(tmpShare.path)) {
				feedback.path = "Share path must be absolute.";
				result = false;
			} else {
				feedback.path = "";
			}
			inputsValid.value = result;
		};

		watch(() => props.share, () => {
			tmpShareInit();
		}, { lazy: false });

		watch(() => props.share?.clients, () => {
			tmpShareInit();
		}, { lazy: false });

		watch(() => ({ ...tmpShare }), async (current, old) => {
			validateInputs();
			if (old === undefined || current.path !== old.path) {
				await checkIfExists();
				if (pathExists.value) {
					dirPermissions.resetNewDirSettings();
				}
			}
		}, { deep: true, immediate: true });

		return {
			dirPermissions,
			pathExists,
			inputsValid,
			tmpShare,
			feedback,
			apply,
			cancel,
			addClient,
			deleteClient,
		}
	},
	components: {
		PlusIcon,
		MinusIcon,
		ExclamationCircleIcon,
		ExclamationIcon,
		ModalPopup,
		FileModeMatrix,
		Table
	}
}
</script>
