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
	<div class="space-y-5 px-4 pb-4">
		<h3 v-if="!share">New Share</h3>
		<div>
			<label class="block text-sm font-medium">Share Path</label>
			<div class="mt-1">
				<input
					type="text"
					name="path"
					id="path"
					class="shadow-sm focus:border-gray-500 focus:ring-0 focus:outline-none block w-full sm:text-sm border-gray-300 dark:border-gray-700 dark:bg-neutral-800 rounded-md"
					placeholder="Share Path"
					v-model="tmpShare.path"
				/>
			</div>
			<div
				class="mt-2 text-sm text-red-600 flex flex-row justify-start items-center space-x-1"
				v-if="feedback.path"
			>
				<ExclamationCircleIcon class="w-5 h-5 inline" />
				<span>{{ feedback.path }}</span>
			</div>
			<div
				v-if="(!feedback.path)"
				class="mt-2 text-sm flex flex-row justify-start items-center space-x-1"
			>
				<ExclamationIcon v-if="!pathExists" class="w-5 h-5 inline-block text-orange-500" />
				<span v-if="!pathExists" class="text-orange-500">Path does not exist.</span>
				<button
					v-if="!pathExists"
					class="text-orange-500 hover:text-orange-800 underline"
					@click="makeDir"
				>Create now</button>
				<button
					v-else
					class="text-lime-500 hover:text-lime-800 underline"
					@click="makeDir"
				>Edit Permissions</button>
				<ModalPopup ref="newDirModal" class="text-gray-700 dark:text-gray-200">
					<div class="flex flex-col space-y-4">
						<div class="space-y-1">
							<div class="grid grid-cols-4 gap-2 justify-items-center">
								<label class="justify-self-start block text-sm font-medium"></label>
								<label class="block text-sm font-medium">Read</label>
								<label class="block text-sm font-medium">Write</label>
								<label class="block text-sm font-medium">Execute</label>

								<label class="justify-self-start block text-sm font-medium">Owner</label>
								<input class="dark:bg-neutral-800 dark:border-gray-700 dark:checked:bg-red-600 focus:ring-0 focus:outline-none h-4 w-4 text-red-600 border-gray-300 rounded" type="checkbox" v-model="modeMatrix.owner.read" />
								<input class="dark:bg-neutral-800 dark:border-gray-700 dark:checked:bg-red-600 focus:ring-0 focus:outline-none h-4 w-4 text-red-600 border-gray-300 rounded" type="checkbox" v-model="modeMatrix.owner.write" />
								<input class="dark:bg-neutral-800 dark:border-gray-700 dark:checked:bg-red-600 focus:ring-0 focus:outline-none h-4 w-4 text-red-600 border-gray-300 rounded" type="checkbox" v-model="modeMatrix.owner.execute" />

								<label class="justify-self-start block text-sm font-medium">Group</label>
								<input class="dark:bg-neutral-800 dark:border-gray-700 dark:checked:bg-red-600 focus:ring-0 focus:outline-none h-4 w-4 text-red-600 border-gray-300 rounded" type="checkbox" v-model="modeMatrix.group.read" />
								<input class="dark:bg-neutral-800 dark:border-gray-700 dark:checked:bg-red-600 focus:ring-0 focus:outline-none h-4 w-4 text-red-600 border-gray-300 rounded" type="checkbox" v-model="modeMatrix.group.write" />
								<input class="dark:bg-neutral-800 dark:border-gray-700 dark:checked:bg-red-600 focus:ring-0 focus:outline-none h-4 w-4 text-red-600 border-gray-300 rounded" type="checkbox" v-model="modeMatrix.group.execute" />

								<label class="justify-self-start block text-sm font-medium">Other</label>
								<input class="dark:bg-neutral-800 dark:border-gray-700 dark:checked:bg-red-600 focus:ring-0 focus:outline-none h-4 w-4 text-red-600 border-gray-300 rounded" type="checkbox" v-model="modeMatrix.other.read" />
								<input class="dark:bg-neutral-800 dark:border-gray-700 dark:checked:bg-red-600 focus:ring-0 focus:outline-none h-4 w-4 text-red-600 border-gray-300 rounded" type="checkbox" v-model="modeMatrix.other.write" />
								<input class="dark:bg-neutral-800 dark:border-gray-700 dark:checked:bg-red-600 focus:ring-0 focus:outline-none h-4 w-4 text-red-600 border-gray-300 rounded" type="checkbox" v-model="modeMatrix.other.execute" />
							</div>

							<div>
								<label class="text-sm font-medium">Result</label>
								<span
									class="ml-8 font-mono font-medium whitespace-nowrap overflow-visible grow-0 basis-0"
								>{{ newDirSettings.modeStr }}</span>
							</div>
						</div>
						<div>
							<label class="block text-sm font-medium">Owner</label>
							<select
								id="log-level"
								name="log-level"
								class="mt-1 block pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-0 dark:border-gray-700 dark:bg-neutral-800 focus:border-gray-500 sm:text-sm rounded-md"
								v-model="newDirSettings.owner"
							>
								<option v-for="user in users" :value="user.user">{{ user.pretty }}</option>
							</select>
						</div>
						<div>
							<label class="block text-sm font-medium">Group</label>
							<select
								id="log-level"
								name="log-level"
								class="mt-1 block pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-0 dark:border-gray-700 dark:bg-neutral-800 focus:border-gray-500 sm:text-sm rounded-md"
								v-model="newDirSettings.group"
							>
								<option v-for="group in groups" :value="group.group">{{ group.pretty }}</option>
							</select>
						</div>
					</div>
				</ModalPopup>
			</div>
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
									<th
										scope="col"
										class="py-3.5 pl-4 pr-3 text-left text-sm font-semibold sm:pl-6 lg:pl-8"
									>Host</th>
									<th
										scope="col"
										class="py-3.5 pl-4 pr-3 text-left text-sm font-semibold sm:pl-6 lg:pl-8"
									>Settings</th>
									<div class="relative">
										<PlusIcon
											@click="addClient"
											class="w-5 h-5 absolute right-3 top-3.5 cursor-pointer text-gray-500"
										/>
									</div>
								</tr>
							</thead>
							<tbody class="bg-white dark:bg-neutral-800">
								<tr
									v-for="(client, index) in tmpShare.clients"
									:class="index % 2 === 0 ? undefined : 'bg-neutral-50 dark:bg-neutral-700'"
								>
									<td class="w-1/4 whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium sm:pl-6 lg:pl-8">
										<input
											type="text"
											class="shadow-sm focus:border-gray-500 focus:ring-0 focus:outline-none block w-full sm:text-sm border-gray-300 dark:border-gray-700 dark:bg-neutral-800 rounded-md"
											v-model="client.host"
										/>
									</td>
									<td class="w-3/4 whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium sm:pl-6 lg:pl-8">
										<input
											type="text"
											class="shadow-sm focus:border-gray-500 focus:ring-0 focus:outline-none block w-full sm:text-sm border-gray-300 dark:border-gray-700 dark:bg-neutral-800 rounded-md"
											v-model="client.settings"
										/>
									</td>
									<td
										v-if="tmpShare.clients.length > 1"
										class="w-1/4 whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium sm:pl-6 lg:pl-8"
									>
										<MinusIcon
											@click="deleteClient(client)"
											class="w-5 h-5 uppercase text-red-600 hover:text-red-900 cursor-pointer"
										/>
									</td>
								</tr>
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</div>
		<div class="flex flex-row space-x-3 w-full justify-end">
			<button class="btn btn-secondary" @click="cancel">Cancel</button>
			<button class="btn btn-primary" @click="apply" :disabled="!inputsValid">Apply</button>
		</div>
	</div>
</template>

<script>
import { reactive, ref, watch } from "vue";
import { PlusIcon, MinusIcon, ExclamationCircleIcon, ExclamationIcon } from "@heroicons/vue/solid";
import useSpawn from "./UseSpawn";
import ModalPopup from "./ModalPopup.vue";

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
		const newDirModal = ref();
		const pathExists = ref(false);
		const inputsValid = ref(false);
		const tmpShare = reactive({});
		const feedback = reactive({});

		const newDirSettings = reactive({
			mode: 0o755,
			modeStr: "rwxr-xr-x",
			owner: 'root',
			group: 'root',
		});
		const modeMatrix = reactive({
			owner: { read: true, write: true, execute: true },
			group: { read: true, write: false, execute: true },
			other: { read: true, write: false, execute: true },
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
			emit('update-share', tmpShare);
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

		const resetNewDirSettings = async () => {
			try {
				const stat = (await useSpawn(['stat', '--format=%a:%U:%G', tmpShare.path], { superuser: 'try' }).promise()).stdout.trim().split(':');
				newDirSettings.mode = parseInt(stat[0], 8);
				newDirSettings.owner = stat[1];
				newDirSettings.group = stat[2];
			} catch (state) { console.error(state) }
		};

		const makeDir = async () => {
			try {
				await resetNewDirSettings();
				const choice = await newDirModal.value.confirm("Share Directory Permissions", "", { icon: 'none' });
				if (!choice)
					return;
				await useSpawn(['mkdir', '-p', tmpShare.path], { superuser: 'try' }).promise();
				await useSpawn(['chown', newDirSettings.owner, tmpShare.path], { superuser: 'try' }).promise();
				await useSpawn(['chgrp', newDirSettings.group, tmpShare.path], { superuser: 'try' }).promise();
				await useSpawn(['chmod', newDirSettings.mode.toString(8), tmpShare.path], { superuser: 'try' }).promise();
				await checkIfExists();
			} catch (status) {
				await props.modalPopup.alert("Failed to make directory", status.stderr, { icon: 'danger' });
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
				if (pathExists.value) {
					resetNewDirSettings();
				}
			}
		}, { deep: true, immediate: true });

		watch(() => ({ ...modeMatrix }), (current, old) => {
			newDirSettings.mode =
				(modeMatrix.other.execute ? 0b000000001 : 0)
				| (modeMatrix.other.write ? 0b000000010 : 0)
				| (modeMatrix.other.read ? 0b000000100 : 0)
				| (modeMatrix.group.execute ? 0b000001000 : 0)
				| (modeMatrix.group.write ? 0b000010000 : 0)
				| (modeMatrix.group.read ? 0b000100000 : 0)
				| (modeMatrix.owner.execute ? 0b001000000 : 0)
				| (modeMatrix.owner.write ? 0b010000000 : 0)
				| (modeMatrix.owner.read ? 0b100000000 : 0)
			newDirSettings.modeStr =
				(modeMatrix.owner.read ? 'r' : '-')
				+ (modeMatrix.owner.write ? 'w' : '-')
				+ (modeMatrix.owner.execute ? 'x' : '-')
				+ (modeMatrix.group.read ? 'r' : '-')
				+ (modeMatrix.group.write ? 'w' : '-')
				+ (modeMatrix.group.execute ? 'x' : '-')
				+ (modeMatrix.other.read ? 'r' : '-')
				+ (modeMatrix.other.write ? 'w' : '-')
				+ (modeMatrix.other.execute ? 'x' : '-')
				+ ` (${newDirSettings.mode.toString(8).padStart(3, '0')})`;
		}, { deep: true, immediate: true });

		watch(() => newDirSettings.mode, (current, old) => {
			modeMatrix.other.execute = newDirSettings.mode & 0b000000001 ? true : false;
			modeMatrix.other.write = newDirSettings.mode & 0b000000010 ? true : false;
			modeMatrix.other.read = newDirSettings.mode & 0b000000100 ? true : false;
			modeMatrix.group.execute = newDirSettings.mode & 0b000001000 ? true : false;
			modeMatrix.group.write = newDirSettings.mode & 0b000010000 ? true : false;
			modeMatrix.group.read = newDirSettings.mode & 0b000100000 ? true : false;
			modeMatrix.owner.execute = newDirSettings.mode & 0b001000000 ? true : false;
			modeMatrix.owner.write = newDirSettings.mode & 0b010000000 ? true : false;
			modeMatrix.owner.read = newDirSettings.mode & 0b100000000 ? true : false;
		}, { deep: true, immediate: true })

		return {
			newDirModal,
			pathExists,
			inputsValid,
			tmpShare,
			feedback,
			newDirSettings,
			modeMatrix,
			apply,
			cancel,
			addClient,
			deleteClient,
			makeDir,
		}
	},
	components: {
		PlusIcon,
		MinusIcon,
		ExclamationCircleIcon,
		ExclamationIcon,
		ModalPopup,
	}
}
</script>
