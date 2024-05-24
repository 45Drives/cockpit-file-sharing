<template>
    <tr>
        <td>{{ target.name }}</td>
		<td class="button-group-row justify-end">
			<button @click="promptDeletion">
				<span class="sr-only">Delete</span>
				<TrashIcon class="size-icon icon-danger" />
			</button>
		</td>
    </tr>

	<ModalConfirm ref="modalConfirmRef"/>
</template>

<script setup lang="ts">
import type { Target } from '../../types/Target';
import { TrashIcon } from "@heroicons/vue/20/solid";
import { ModalConfirm, wrapActions } from "@45drives/houston-common-ui";
import { confirmBeforeAction } from "@/common/confirmBeforeAction";
import { ProcessError } from '@45drives/houston-common-lib';
import type { ResultAsync } from 'neverthrow';
import { inject, ref } from 'vue';
import type { ISCSIDriver } from '../../types/ISCSIDriver';

const props = defineProps<{target: Target}>();

const emit = defineEmits(['deleteTarget']);

const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver");

const modalConfirmRef = ref<InstanceType<typeof ModalConfirm> | null>(null); 

if (driver === undefined) {
	throw new Error("iSCSI Driver is null");
}

const deleteTarget = () => {
	return driver.andThen((driver) => driver.removeTarget(props.target))
			.map(() => emit("deleteTarget"))
			.mapErr((error) => new ProcessError(`Unable to delete target ${props.target.name}: ${error.message}`));
			
}

const actions = wrapActions({deleteTarget: deleteTarget});

const promptDeletion = confirmBeforeAction(actions.deleteTarget, modalConfirmRef, "Confirm", `Delete target ${props.target.name}?`);

</script>
