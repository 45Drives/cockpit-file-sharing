<template>
    <tr>
        <td>{{ device.deviceName }}</td>
        <td>{{ device.filePath }}</td>
        <td>{{ device.blockSize }}</td>
        <td>{{ device.deviceType }}</td>
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
	import { VirtualDevice } from "../types/VirtualDevice";
	import { TrashIcon } from "@heroicons/vue/20/solid";
	import { ModalConfirm, wrapActions } from "@45drives/houston-common-ui";
	import { inject, ref } from "vue";
	import type { ISCSIDriver } from "../types/ISCSIDriver";
	import { ResultAsync } from "neverthrow";
	import { ProcessError } from "@45drives/houston-common-lib";
	import { confirmBeforeAction } from "@/common/confirmBeforeAction";

	const props = defineProps<{device: VirtualDevice}>();

	const emit = defineEmits(['deleteDevice']);

	const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver");

	const modalConfirmRef = ref<InstanceType<typeof ModalConfirm> | null>(null); 

	if (driver === undefined) {
		throw new Error("iSCSI Driver is null");
	}

	const deleteDevice = () => {
		return driver.andThen((driver) => driver.removeVirtualDevice(props.device))
				.map(() => emit("deleteDevice"))
				.mapErr((error) => new ProcessError(`Unable to delete device ${props.device.deviceName}: ${error.message}`));
				
	}

	const actions = wrapActions({deleteDevice});

	const promptDeletion = confirmBeforeAction(actions.deleteDevice, modalConfirmRef, "Confirm", `Delete device ${props.device.deviceName}?`);

</script>