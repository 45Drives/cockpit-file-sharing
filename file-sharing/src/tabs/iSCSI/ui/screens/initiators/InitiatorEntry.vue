<template>
    <tr>
        <td>{{ initiator.name }}</td>
		<td class="button-group-row justify-end">
			<button @click="promptDeletion">
				<span class="sr-only">Delete</span>
				<TrashIcon class="size-icon icon-danger" />
			</button>
		</td>
    </tr>
</template>

<script setup lang="ts">
	import { TrashIcon } from "@heroicons/vue/20/solid";
	import { wrapActions, confirmBeforeAction } from "@45drives/houston-common-ui";
	import { inject } from "vue";
	import type { ISCSIDriver } from "../../types/ISCSIDriver";
	import { ResultAsync } from "neverthrow";
	import { ProcessError } from "@45drives/houston-common-lib";
    import type { Initiator } from "../../types/Initiator";
    import type { InitiatorGroup } from "../../types/InitiatorGroup";

	const props = defineProps<{initiator: Initiator, initiatorGroup: InitiatorGroup}>();

	const emit = defineEmits(['deleteEntry']);

	const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver");

	if (driver === undefined) {
		throw new Error("iSCSI Driver is null");
	}

	const deleteEntry = () => {
		return driver.andThen((driver) => driver.removeInitiatorFromGroup(props.initiatorGroup, props.initiator))
				.map(() => emit("deleteEntry"))
				.mapErr((error) => new ProcessError(`Unable to remove initiator ${props.initiator.name} from group ${props.initiatorGroup.name}: ${error.message}`));
	}

	const actions = wrapActions({deleteEntry});

	const promptDeletion = confirmBeforeAction({header: "Confirm", body: `Remove initiator ${props.initiator.name} from group ${props.initiatorGroup.name}`}, actions.deleteEntry);

</script>