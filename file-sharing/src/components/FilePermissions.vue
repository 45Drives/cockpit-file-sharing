<template>
	<ModalPopup :showModal="show" headerText="Share Directory Permissions" @apply="apply"
		@cancel="$emit('hide')">
		<div class="flex flex-col space-y-content items-start">
			<FileModeMatrix v-model="mode" />
			<div>
				<label class="block text-sm font-medium">Owner</label>
				<select class="input-textlike" v-model="owner">
					<option v-for="user in users" :value="user.user">{{ user.pretty }}</option>
				</select>
			</div>
			<div>
				<label class="block text-sm font-medium">Group</label>
				<select class="input-textlike" v-model="group">
					<option v-for="group in groups" :value="group.group">{{ group.pretty }}</option>
				</select>
			</div>
		</div>
	</ModalPopup>
</template>

<script>
import { watch, ref } from 'vue';
import ModalPopup from "./ModalPopup.vue";
import FileModeMatrix from "./FileModeMatrix.vue";
import { useSpawn, errorString, canonicalPath } from "@45drives/cockpit-helpers";
export default {
	props: {
		show: Boolean,
		path: String,
		users: Array[Object],
		groups: Array[Object],
		onError: {
			type: Function,
			required: false,
			default: console.error,
		},
	},
	setup(props, { emit }) {
		const mode = ref(0);
		const owner = ref("");
		const group = ref("");

		const getPermissions = async () => {
			try {
				let modeStr;
				[modeStr, owner.value, group.value] = (
					await useSpawn(['stat', '--format=%a:%U:%G', props.path], { superuser: 'try' }).promise()
				).stdout.trim().split(':');
				mode.value = parseInt(modeStr, 8);
			} catch (state) {
				const error = new Error(errorString(state));
				error.name = "Permissions Query Error";
				props.onError(error);
				emit('hide');
			}
		}

		const apply = async () => {
			if (canonicalPath(props.path) === '/') {
				const error = new Error("Cannot Edit Permissions for '/'. If you think you need to do this, you don't.");
				error.name = "Permissions Apply Error";
				props.onError(error);
				emit('hide');
				return;
			}
			const procs = [];
			procs.push(useSpawn(['chown', owner.value, props.path], { superuser: 'try' }).promise());
			procs.push(useSpawn(['chgrp', group.value, props.path], { superuser: 'try' }).promise());
			procs.push(useSpawn(['chmod', mode.value.toString(8), props.path], { superuser: 'try' }).promise());
			for (const proc of procs) {
				try {
					await proc;
				} catch (state) {
					const error = new Error(errorString(state));
					error.name = "Permissions Apply Error";
					props.onError(error);
				}
			}
			emit('hide');
		}

		watch(() => props.show, (show, lastShow) => {
			if (show || lastShow === undefined) getPermissions();
		}, { immediate: true });

		return {
			mode,
			owner,
			group,
			apply,
		}
	},
	components: {
		ModalPopup,
		FileModeMatrix,
	},
	emits: [
		'hide',
	]
}
</script>
