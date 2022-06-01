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
	<div class="card">
		<div class="card-header flex flex-row items-center gap-2">
			<div class="text-header">Shares</div>
			<LoadingSpinner v-if="processing || parentProcessing" class="size-icon" />
		</div>
		<div class="overflow-hidden"
			:style="{ 'max-height': showAddShare ? '1500px' : '0', transition: showAddShare ? 'max-height 0.5s ease-in' : 'max-height 0.5s ease-out' }">
			<div class="card-body">
				<SambaShareEditor @applyShare="addShare" @hide="showAddShare = false" :users="users" :groups="groups"
					:ctdbHosts="ctdbHosts" :cephLayoutPools="cephLayoutPools" :shares="shares"
					ref="newShareEditorRef" />
			</div>
		</div>
		<div :class="[showAddShare ? '' : '!border-t-0', 'card-body p-0 sm:p-6']">
			<div class="sm:shadow sm:rounded-lg sm:border sm:border-default overflow-hidden">
				<Table emptyText="No shares. Click '+' to add one." shrinkHeight noScroll noHeader
					class="!border-none !shadow-none">
					<template #thead>
						<tr>
							<th scope="col">Name</th>
							<th scope="col">Path</th>
							<th scope="col" class="flex flex-row justify-end">
								<span class="sr-only">Edit/Delete</span>
								<button @click="showAddShare ? newShareEditorRef.cancel() : showAddShare = true">
									<PlusIcon class="size-icon icon-default" />
								</button>
							</th>
						</tr>
					</template>
					<template #tbody>
						<SambaShare v-for="(share, index) in shares" :share="shares[index]" :index="index"
							@deleteShare="deleteShare" @updateShare="updateShare" :users="users" :groups="groups"
							:ctdbHosts="ctdbHosts" :cephLayoutPools="cephLayoutPools" :shares="shares" />
					</template>
				</Table>
			</div>
		</div>
	</div>
</template>

<script>
import SambaShare from "./SambaShare.vue";
import SambaShareEditor from "./SambaShareEditor.vue";
import { generateConfDiff } from "../functions";
import { PlusIcon } from "@heroicons/vue/solid";
import { useSpawn, errorString, errorStringHTML } from "@45drives/cockpit-helpers";
import { ref, inject } from "vue";
import LoadingSpinner from "./LoadingSpinner.vue";
import { notificationsInjectionKey } from "../keys";
import Table from "./Table.vue";

export default {
	props: {
		shares: Array[Object],
		users: Array[String],
		groups: Array[String],
		ctdbHosts: Array[String],
		cephLayoutPools: Array[String],
		parentProcessing: Number,
	},
	setup(props, { emit }) {
		const showAddShare = ref(false);
		const processing = ref(0);
		const notifications = inject(notificationsInjectionKey);
		const newShareEditorRef = ref(null);

		const deleteShare = async (share) => {
			processing.value++;
			try {
				await useSpawn(['net', 'conf', 'delshare', share.name], { superuser: 'try' }).promise();
				// props.shares = props.shares.filter((a) => a !== share); // done in SambaManager with event
				emit('removeShareFromList', share);
				notifications.value.constructNotification("Success", "Successfully deleted share", 'success');
			} catch (state) {
				notifications.value.constructNotification("Failed to delete share", errorStringHTML(state), 'error');
				emit('refreshShares');
			} finally {
				processing.value--;
			}
		}

		const applyShareChanges = async (share, newShare) => {
			let add, remove;
			({ add, remove } = generateConfDiff(share, newShare));
			for (const args of add) {
				await useSpawn(['net', 'conf', 'setparm', newShare.name, ...args], { superuser: 'try' }).promise();
			}
			for (const args of remove) {
				await useSpawn(['net', 'conf', 'delparm', newShare.name, ...args], { superuser: 'try' }).promise();
			}
		}

		const addShare = async (share, doneHook) => {
			processing.value++;
			try {
				await useSpawn(['net', 'conf', 'addshare', share.name, share.path], { superuser: 'try' }).promise();
				await applyShareChanges(null, share);
				await doneHook?.();
				emit('appendShareToList', share);
				setTimeout(() => newShareEditorRef.value.tmpShareInit(), 500);
				notifications.value.constructNotification("Success", "Successfully added share", 'success');
			} catch (state) {
				notifications.value.constructNotification("Failed to add share", errorStringHTML(state), 'error');
				emit('refreshShares');
			} finally {
				showAddShare.value = false;
				processing.value--;
			}
		}

		const updateShare = async (share, newShare, doneHook) => {
			processing.value++;
			try {
				await applyShareChanges(share, newShare);
				await doneHook?.();
				Object.assign(share, newShare);
				notifications.value.constructNotification("Success", "Successfully updated share", 'success');
			} catch (state) {
				notifications.value.constructNotification("Failed to update share", errorStringHTML(state), 'error');
				emit('refreshShares');
			} finally {
				processing.value--;
			}
		}

		return {
			processing,
			showAddShare,
			deleteShare,
			applyShareChanges,
			addShare,
			updateShare,
			newShareEditorRef,
		}
	},
	components: {
		SambaShare,
		SambaShareEditor,
		PlusIcon,
		LoadingSpinner,
		Table,
	},
	emits: [
		'refreshShares',
		'removeShareFromList',
		'appendShareToList',
	]
}
</script>
