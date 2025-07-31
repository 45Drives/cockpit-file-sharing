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
import { ResultAsync } from "neverthrow";
import { ProcessError } from "@45drives/houston-common-lib";
import type { LogicalUnitNumber } from "@/tabs/iSCSI/types/LogicalUnitNumber";
import type { InitiatorGroup } from "@/tabs/iSCSI/types/InitiatorGroup";
import type { ISCSIDriver } from "@/tabs/iSCSI/types/drivers/ISCSIDriver";

const props = defineProps<{
  logicalUnitNumber: LogicalUnitNumber;
  initiatorGroup: InitiatorGroup;
}>();

const emit = defineEmits(["deleteEntry"]);

const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver")!;

const deleteEntry = () => {
  return driver
    .andThen((driver) =>
      driver.removeLogicalUnitNumberFromGroup(props.initiatorGroup, props.logicalUnitNumber)
    )
    .map(() => {
      emit("deleteEntry");
      emit("lunDeleted", props.logicalUnitNumber.blockDevice?.deviceName);
    })    .mapErr(
      (error) =>
        new ProcessError(
          `Unable to remove LUN ${props.logicalUnitNumber.unitNumber} from group ${props.initiatorGroup.name} : ${error.message}`
        )
    );
};

const actions = wrapActions({ deleteEntry });

const promptDeletion = confirmBeforeAction(
  {
    header: "Confirm",
    body: `Delete LUN ${props.logicalUnitNumber.unitNumber} from group ${props.initiatorGroup.name}?`,
  },
  actions.deleteEntry
);
</script>
