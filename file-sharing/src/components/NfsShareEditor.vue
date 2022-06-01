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
	<div class="space-y-content text-base">
		<div class="text-header" v-if="!share">New Share</div>
		<div>
			<label class="block text-label">Share Path</label>
			<input type="text" name="path" class="w-full input-textlike" placeholder="Share Path"
				v-model="tmpShare.path" @change="tmpShare.path = canonicalPath(tmpShare.path)" />
			<div class="feedback-group" v-if="feedback.path">
				<ExclamationCircleIcon class="size-icon icon-error" />
				<span class="text-feedback text-error">{{ feedback.path }}</span>
			</div>
			<div class="feedback-group" v-else>
				<ExclamationIcon v-if="!pathExists" class="size-icon icon-warning" />
				<span v-if="!pathExists" class="text-feedback text-warning">Path does not exist.</span>
				<button v-if="!pathExists" class="text-feedback text-warning underline" @click="createDir">Create
					now</button>
				<button v-else class="text-feedback text-primary" @click="showPermissionsEditor = true">Edit
					Permissions</button>
				<FilePermissions :show="showPermissionsEditor" :path="tmpShare.path" :users="users" :groups="groups"
					:onError="error => notifications.constructNotification(error.name, error.message, 'error')"
					@hide="showPermissionsEditor = false" />
			</div>
		</div>
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
				<tr v-for="(client, index) in tmpShare.clients"
					:class="index % 2 === 0 ? undefined : 'bg-neutral-50 dark:bg-neutral-700'">
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
import { useSpawn, errorStringHTML, canonicalPath } from "@45drives/cockpit-helpers";
import ModalPopup from "./ModalPopup.vue";
import { notificationsInjectionKey } from "../keys";
import FilePermissions from "./FilePermissions.vue";
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

		const showPermissionsEditor = ref(false);

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
			emit('hide');
			setTimeout(() => tmpShareInit(), 500);
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

		const createDir = async () => {
			try {
				await useSpawn(['mkdir', '-p', tmpShare.path], { superuser: 'try' }).promise();
				checkIfExists();
			} catch (state) {
				notifications.constructNotification("Failed to create directory", errorStringHTML(state), 'error');
			}
		}

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
			}
		}, { deep: true, immediate: true });

		return {
			showPermissionsEditor,
			pathExists,
			inputsValid,
			tmpShare,
			feedback,
			apply,
			cancel,
			addClient,
			deleteClient,
			createDir,
			canonicalPath,
			notifications,
		}
	},
	components: {
		PlusIcon,
		MinusIcon,
		ExclamationCircleIcon,
		ExclamationIcon,
		ModalPopup,
		FilePermissions,
		Table
	}
}
</script>
