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
			<button @click="deleteShare">
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
					class="py-2"
					:users="users"
					:groups="groups"
					:shares="shares"
					:corosyncHosts="corosyncHosts"
					:cephLayoutPools="cephLayoutPools"
				/>
			</div>
		</td>
	</tr>

	<ModalPopup
		:showModal="confirmationModal.showModal"
		@apply="confirmationModal.applyCallback"
		@cancel="confirmationModal.cancelCallback"
		applyDangerous
		applyText="Yes"
		:headerText="confirmationModal.headerText"
	>
		<template #icon>
			<ExclamationCircleIcon class="size-icon-xl icon-danger shrink-0" />
		</template>
		{{ confirmationModal.bodyText }}
	</ModalPopup>

</template>

<script>
import { reactive, ref } from "vue";
import NfsShareEditor from "./NfsShareEditor.vue";
import { ExclamationCircleIcon, PencilAltIcon, TrashIcon } from "@heroicons/vue/solid";
import ModalPopup from "./ModalPopup.vue";
export default {
	props: {
		share: Object,
		users: Array[Object],
		groups: Array[Object],
		shares: Array[Object],
		corosyncHosts: Array[String],
		cephLayoutPools: Array[String],
	},
	setup(props, { emit }) {
		const editorRef = ref();
		const showEditor = ref(false);

		const confirmationModal = reactive({
			showModal: false,
			headerText: "",
			bodyText: "",
			ask: (header, body) => {
				return new Promise((resolve, reject) => {
					confirmationModal.showModal = true;
					confirmationModal.headerText = header;
					confirmationModal.bodyText = body;
					const respond = (result) => {
						confirmationModal.showModal = false;
						resolve(result);
					}
					confirmationModal.applyCallback = () => respond(true);
					confirmationModal.cancelCallback = () => respond(false);
				});
			},
			applyCallback: () => { },
			cancelCallback: () => { },
		});

		const updateShare = (newShare) => {
			emit('update-share', props.share, newShare);
		}

		const deleteShare = async () => {
			if (!await confirmationModal.ask(`Permanently delete ${props.share.path}?`, "This cannot be undone."))
				return;
			if (editorRef.value.cephShareRef.isCeph && !editorRef.value.cephShareRef.cephNotRemounted)
				editorRef.value.cephShareRef.removeCephMount();
			emit('delete-share', props.share);
		}

		return {
			showEditor,
			editorRef,
			confirmationModal,
			deleteShare,
			updateShare,
		};
	},
	components: {
		NfsShareEditor,
		PencilAltIcon,
		TrashIcon,
		ModalPopup,
		ExclamationCircleIcon,
	}
}
</script>
