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
import { ResultAsync } from "neverthrow";
import { ProcessError } from "@45drives/houston-common-lib";
import type { Initiator } from "@/tabs/iSCSI/types/Initiator";
import type { InitiatorGroup } from "@/tabs/iSCSI/types/InitiatorGroup";
import type { ISCSIDriver } from "@/tabs/iSCSI/types/drivers/ISCSIDriver";

const props = defineProps<{ initiator: Initiator; initiatorGroup: InitiatorGroup }>();

const emit = defineEmits(["deleteEntry"]);

const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver")!;

const deleteEntry = () => {
  return driver
    .andThen((driver) => driver.removeInitiatorFromGroup(props.initiatorGroup, props.initiator))
    .map(() => emit("deleteEntry"))
    .mapErr(
      (error) =>
        new ProcessError(
          `Unable to remove initiator ${props.initiator.name} from group ${props.initiatorGroup.name}: ${error.message}`
        )
    );
};

const actions = wrapActions({ deleteEntry });

const promptDeletion = confirmBeforeAction(
  {
    header: "Confirm",
    body: `Remove initiator "${props.initiator.name}" from group "${props.initiatorGroup.name}"?

Removing an initiator from an iSCSI initiator group can cause related targets or resources to restart and may disrupt active sessions using this target.
 It is recommended to perform this action during a planned maintenance window or other downtime if it could impact production workloads.`,
 dangerous: true
  },
  actions.deleteEntry
);

</script>
