<template>
	<div class="card-header flex flex-row items-center justify-between">
		<h3 class="text-lg leading-6 font-medium">Shares</h3>
		<button
			class="btn-primary"
			@click="showAddShare = !showAddShare"
		>{{ showAddShare ? 'Cancel' : 'Add Share' }}</button>
	</div>
	<div class="card-body">
		<div
			class="overflow-hidden"
			:style="{ 'max-height': showAddShare ? '1000px' : '0', transition: showAddShare ? 'max-height 0.5s ease-in' : 'max-height 0.5s ease-out' }"
		>
			<SambaShareEditor
				@apply-share="addShare"
				@hide="showAddShare = false"
				:users="users"
				:groups="groups"
			/>
		</div>
		<div class="mt-8 flex flex-col">
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
										<RefreshIcon
											@click="$emit('refresh-shares')"
											class="w-5 h-5 absolute right-3 top-3.5 cursor-pointer text-gray-500"
										/>
									</div>
								</tr>
							</thead>
							<tbody class="bg-white dark:bg-neutral-800">
								<SambaShare
									v-for="(share, index) in shares"
									:share="share"
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
									>No shares. Click "Add Share" to add one.</td>
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
import { RefreshIcon } from "@heroicons/vue/solid";
export default {
	data() {
		return {
			shares: this.initialShares,
			showAddShare: false,
		};
	},
	props: {
		initialShares: Array[Object],
		users: Array[String],
		groups: Array[String],
	},
	components: { SambaShare, SambaShareEditor, RefreshIcon },
	methods: {
		async deleteShare(share) {
			if (!confirm("Are you sure?"))
				return;
			try {
				// run net conf commands
				console.log(['net', 'conf', 'delshare', share.name]);
				this.shares = this.shares.filter((a) => a !== share);
			} catch (err) {
				alert(err);
			}
		},
		async addShare(share) {
			try {
				// run net conf commands
				console.log(['net', 'conf', 'addshare', share.name, share.path]);
				await this.applyShareChanges(null, share);
				this.shares = [...this.shares, share];
			} catch (err) {
				alert(err);
			}
			this.showAddShare = false;
		},
		async updateShare(share, newShare) {
			try {
				// run net conf commands
				await this.applyShareChanges(share, newShare);
				Object.assign(share, newShare);
			} catch (err) {
				alert(err);
			}
		},
		async applyShareChanges(share, newShare) {
			let add, remove;
			({ add, remove } = generateConfDiff(share, newShare));
			add.forEach((args) => {
				console.log(['net', 'conf', 'setparm', newShare.name, ...args]);
			});
			remove.forEach((args) => {
				console.log(['net', 'conf', 'delparm', newShare.name, ...args]);
			});
			// throw("test error");
		},
	},
	emits: ['refresh-shares'],
	watch: {
		initialShares(newShares) {
			this.shares = newShares;
		}
	}
}
</script>

<style scoped>
/* .samba-share-management {
	display: flex;
	flex-direction: column;
	padding: 5px;
}

.header {
	display: flex;
	flex-direction: row;
	justify-content: space-between;
	align-items: baseline;
	padding: 0 10px 0 10px;
}

.list {
	display: flex;
	flex-direction: column;
	overflow: auto;
} */
</style>
