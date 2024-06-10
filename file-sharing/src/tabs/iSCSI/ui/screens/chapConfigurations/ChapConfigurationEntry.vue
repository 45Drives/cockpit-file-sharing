<template>
    <tr>
        <td>{{ config.username }}</td>
        <td>
			{{ displayedPassword }}
			<button style="display: inline-block;" @click="showPassword = !showPassword">
      			<EyeIcon class="size-icon icon-default"/>
    		</button>
		</td>
        <td>{{ config.chapType }}</td>
		<td class="button-group-row justify-end">
			<button @click="promptDeletion">
				<span class="sr-only">Delete</span>
				<TrashIcon class="size-icon icon-danger" />
			</button>
		</td>
    </tr>
</template>

<script setup lang="ts">
	import { TrashIcon, EyeIcon } from "@heroicons/vue/20/solid";
	import { wrapActions, confirmBeforeAction } from "@45drives/houston-common-ui";
	import { computed, inject, ref } from "vue";
	import type { ISCSIDriver } from "../../types/ISCSIDriver";
	import { ResultAsync } from "neverthrow";
	import { ProcessError } from "@45drives/houston-common-lib";
    import type { Target } from "../../types/Target";
    import type { CHAPConfiguration } from "../../types/CHAPConfiguration";

	const props = defineProps<{target: Target, config: CHAPConfiguration}>();

	const emit = defineEmits(['deleteEntry']);

	const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver");

	if (driver === undefined) {
		throw new Error("iSCSI Driver is null");
	}

	const showPassword = ref(false);

	const displayedPassword = computed(() => {
		return showPassword.value ? props.config.password : "****************"
	});

	const deleteEntry = () => {
		return driver.andThen((driver) => driver.removeCHAPConfigurationFromTarget(props.target, props.config))
				.map(() => emit("deleteEntry"))
				.mapErr((error) => new ProcessError(`Unable to delete CHAP Configuration for ${props.config.username}: ${error.message}`));
	}

	const actions = wrapActions({deleteEntry});

	const promptDeletion = confirmBeforeAction({header: "Confirm", body: `Delete CHAP Configuration for ${props.config.username}?`}, actions.deleteEntry);

</script>