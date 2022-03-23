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
				v-if="!pathExists && !feedback.path"
				class="mt-2 text-sm text-orange-500 flex flex-row justify-start items-center space-x-1"
			>
				<ExclamationIcon class="w-5 h-5 inline-block" />
				<span>Path does not exist.</span>
				<button class="underline" @click="makeDir">Create now</button>
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
		<div class="flex flex-row space-x-3">
			<button class="btn btn-secondary" @click="cancel">Cancel</button>
			<button class="btn btn-primary" @click="apply" :disabled="!inputsValid">Apply</button>
		</div>
	</div>
</template>

<script>
import { reactive, ref, watch } from "vue";
import { PlusIcon, MinusIcon, ExclamationCircleIcon, ExclamationIcon } from "@heroicons/vue/solid";
import useSpawn from "./UseSpawn";

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
	},
	setup(props, { emit }) {
		const pathExists = ref(false);
		const inputsValid= ref(false);
		const tmpShare = reactive({});
		const feedback = reactive({});

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

		const makeDir = async () => {
			try {
				await useSpawn(['mkdir', '-p', tmpShare.path], { superuser: 'try' }).promise();
				await checkIfExists();
			} catch (status) {
				await props.modalPopup.alert("Failed to make directory", status.stderr, { danger: true });
			}
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
			}
		}, { deep: true, immediate: true });

		return {
			pathExists,
			inputsValid,
			tmpShare,
			feedback,
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
	}
}
</script>
