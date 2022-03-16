<template>
	<div class="card-header flex flex-row items-center justify-between">
		<div class="flex flex-row space-x-3">
			<h3 class="text-lg leading-6 font-medium">Shares</h3>
			<LoadingSpinner v-if="!loaded" class="w-5 h-5" />
		</div>
	</div>
	<div class="card-body">
		<div
			class="overflow-hidden"
			:style="{ 'max-height': showAddShare ? '1500px' : '0', transition: showAddShare ? 'max-height 0.5s ease-in' : 'max-height 0.5s ease-out' }"
		>
			<SambaShareEditor
				@apply-share="addShare"
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
									<th
										scope="col"
										class="py-3.5 pl-4 pr-3 text-left text-sm font-semibold sm:pl-6 lg:pl-8"
									>Name</th>
									<th scope="col" class="px-3 py-3.5 text-left text-sm font-semibold">Path</th>
									<th scope="col" class="relative py-3.5 pl-3 pr-4 sm:pr-6 lg:pr-8">
										<span class="sr-only">Edit</span>
									</th>
									<th scope="col" class="relative py-3.5 pl-3 pr-4 sm:pr-6 lg:pr-8">
										<span class="sr-only">Delete</span>
									</th>
									<div class="relative">
										<PlusIcon
											@click="showAddShare = !showAddShare"
											class="w-5 h-5 absolute right-3 top-3.5 cursor-pointer text-gray-500"
										/>
									</div>
								</tr>
							</thead>
							<tbody class="bg-white dark:bg-neutral-800">
								<SambaShare
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
										colspan="4"
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
</template>

<script>
import SambaShare from "./SambaShare.vue";
import SambaShareEditor from "./SambaShareEditor.vue";
import { generateConfDiff } from "../functions";
import { PlusIcon } from "@heroicons/vue/solid";
import useSpawn from "./UseSpawn";
import { ref } from "vue";
import LoadingSpinner from "./LoadingSpinner.vue";

const spawnOpts = {
	superuser: 'require',
	promise: true
}

export default {
	props: {
		shares: Array[Object],
		users: Array[String],
		groups: Array[String],
		loaded: Boolean,
	},
	setup(props, { emit }) {
		const showAddShare = ref(false);

		const deleteShare = async (share) => {
			if (!confirm(`Permanently delete ${share.name}?`))
				return;
			try {
				// run net conf commands
				await useSpawn(['net', 'conf', 'delshare', share.name], spawnOpts);
				props.shares = props.shares.filter((a) => a !== share);
			} catch (state) {
				alert(state.stderr);
				emit('refresh-shares');
			}
		}

		const applyShareChanges = async (share, newShare) => {
			let add, remove;
			({ add, remove } = generateConfDiff(share, newShare));
			for (const args of add) {
				await useSpawn(['net', 'conf', 'setparm', newShare.name, ...args], spawnOpts);
			}
			for (const args of remove) {
				await useSpawn(['net', 'conf', 'delparm', newShare.name, ...args], spawnOpts);
			}
		}

		const addShare = async (share) => {
			try {
				// run net conf commands
				await useSpawn(['net', 'conf', 'addshare', share.name, share.path], spawnOpts);
				await applyShareChanges(null, share);
				props.shares = [...props.shares, share];
			} catch (state) {
				alert(state.stderr);
				emit('refresh-shares');
			}
			showAddShare.value = false;
		}

		const updateShare = async (share, newShare) => {
			try {
				// run net conf commands
				await applyShareChanges(share, newShare);
				Object.assign(share, newShare);
			} catch (state) {
				alert(state.stderr);
				emit('refresh-shares');
			}
		}

		return {
			showAddShare,
			deleteShare,
			applyShareChanges,
			addShare,
			updateShare,
		}
	},
	components: { SambaShare, SambaShareEditor, PlusIcon, LoadingSpinner },
}
</script>
