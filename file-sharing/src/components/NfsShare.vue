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
	<tr>
		<td>{{ share.path }}</td>
		<td class="button-group-row justify-end">
			<button @click="showEditor ? editorRef.cancel() : showEditor = true">
				<span class="sr-only">Edit share for {{ share.path }}</span>
				<PencilAltIcon class="size-icon icon-default" />
			</button>
			<button @click="$emit('delete-share', share)">
				<span class="sr-only">Delete share for {{ share.path }}</span>
				<TrashIcon class="size-icon icon-danger" />
			</button>
		</td>
	</tr>
	<tr></tr> <!-- needed to make backgrounds match -->
	<tr>
		<td colspan="2" class="!py-0">
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
					class="py-2"
				/>
			</div>
		</td>
	</tr>
</template>

<script>
import { ref } from "vue";
import NfsShareEditor from "./NfsShareEditor.vue";
import { PencilAltIcon, TrashIcon } from "@heroicons/vue/solid";
export default {
	props: {
		share: Object,
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
		PencilAltIcon,
		TrashIcon,
	}
}
</script>
