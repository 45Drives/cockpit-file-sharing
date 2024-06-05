<template>
    <tr>
        <td>{{ logicalUnitNumber.name }}</td>
        <td>{{ logicalUnitNumber.unitNumber }}</td>
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
    import type { InitiatorGroup } from "../../types/InitiatorGroup";
    import type { LogicalUnitNumber } from "../../types/LogicalUnitNumber";

	const props = defineProps<{logicalUnitNumber: LogicalUnitNumber, initiatorGroup: InitiatorGroup}>();

	const emit = defineEmits(['deleteEntry']);

	const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver");

	if (driver === undefined) {
		throw new Error("iSCSI Driver is null");
	}

	const deleteEntry = () => {
		return driver.andThen((driver) => driver.removeLogicalUnitNumberFromGroup(props.initiatorGroup, props.logicalUnitNumber))
				.map(() => emit("deleteEntry"))
				.mapErr((error) => new ProcessError(`Unable to remove LUN ${props.logicalUnitNumber.unitNumber} from group ${props.initiatorGroup.name} : ${error.message}`));
	}

	const actions = wrapActions({deleteEntry});

	const promptDeletion = confirmBeforeAction({header: "Confirm", body: `Delete LUN ${props.logicalUnitNumber.unitNumber} from group ${props.initiatorGroup.name}?`}, actions.deleteEntry);

</script>