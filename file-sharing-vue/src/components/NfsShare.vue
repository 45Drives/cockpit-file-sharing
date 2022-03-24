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
	<tr :class="index % 2 === 0 ? undefined : 'bg-neutral-50 dark:bg-neutral-700'">
		<td class="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium sm:pl-6 lg:pl-8 text-gray-500 dark:text-gray-400">{{ share.path }}</td>
		<td
			class="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6 lg:pr-8"
		>
			<div class="inline-block w-20 text-left">
				<a
					@click="showEditor ? editorRef.cancel() : showEditor = true"
					class="uppercase text-lime-500 hover:text-lime-800 cursor-pointer"
				>
					{{ showEditor ? 'Cancel' : 'Edit' }}
					<span class="sr-only">, {{ share.path }}</span>
				</a>
			</div>
		</td>
		<td
			class="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6 lg:pr-8"
		>
			<a
				@click="$emit('delete-share', share)"
				class="uppercase text-red-600 hover:text-red-900 cursor-pointer"
			>
				Delete
				<span class="sr-only">, {{ share.name }}</span>
			</a>
		</td>
	</tr>
	<tr :class="index % 2 === 0 ? undefined : 'bg-neutral-50 dark:bg-neutral-700'">
		<td colspan="3">
			<div
				class="overflow-hidden"
				:style="{ 'max-height': showEditor ? '1500px' : '0', transition: showEditor ? 'max-height 0.5s ease-in' : 'max-height 0.5s ease-out' }"
			>
				<NfsShareEditor
					:share="share"
					@update-share="updateShare"
					@hide="showEditor = false"
					ref="editorRef"
					:users="users"
					:groups="groups"
				/>
			</div>
		</td>
	</tr>
</template>

<script>
import { ref } from "vue";
import NfsShareEditor from "./NfsShareEditor.vue";
export default {
	props: {
		share: Object,
		index: Number,
		users: Array[Object],
		groups: Array[Object],
	},
	setup(props, { emit }) {
		const editorRef = ref();
		const showEditor = ref(false);

		const updateShare = (newShare) => {
			emit('update-share', props.share, newShare);
		}

		return {
			showEditor,
			updateShare,
			editorRef,
		}
	},
	components: {
		NfsShareEditor,
	}
}
</script>
