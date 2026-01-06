<template>
  <tr>
    <td>{{ initiator.name }}</td>
    <td class="button-group-row justify-end">
      <button @click="promptDeletion" :disabled="!canCreate">
        <span class="sr-only">Delete</span>
        <TrashIcon class="size-icon icon-danger" />
      </button>
    </td>
  </tr>
</template>

<script setup lang="ts">
import { TrashIcon } from "@heroicons/vue/20/solid";
import { wrapActions, confirmBeforeAction } from "@45drives/houston-common-ui";
import { computed, inject, type Ref } from "vue";
import { ResultAsync } from "neverthrow";
import { ProcessError } from "@45drives/houston-common-lib";
import type { Initiator } from "@/tabs/iSCSI/types/Initiator";
import type { InitiatorGroup } from "@/tabs/iSCSI/types/InitiatorGroup";
import type { ISCSIDriver } from "@/tabs/iSCSI/types/drivers/ISCSIDriver";
import { useUserSettings } from "@/common/user-settings";

const props = defineProps<{ initiator: Initiator; initiatorGroup: InitiatorGroup }>();

const emit = defineEmits(["deleteEntry"]);

const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver")!;
const canEditIscsi = inject<Ref<boolean>>("canEditIscsi");
if (!canEditIscsi) throw new Error("canEditIscsi not provided");
const canCreate = computed(() => canEditIscsi.value);

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
const deletionBody = computed(() => {
  const base = `Delete initiator group "${props.initiator.name}" from group "${props.initiatorGroup.name}"`;

  const clusteredWarning = `Removing this initiator may restart related resources and disrupt active sessions. Recommended to perform during a maintenance window.`

  const isClustered = useUserSettings().value.iscsi.clusteredServer === true;

  return isClustered ? `${base}\n${clusteredWarning.trim()}` : base;
});

const promptDeletion = confirmBeforeAction(
  {
    header: "Confirm",
    body: deletionBody.value,
    dangerous: true
  },
  actions.deleteEntry
);

</script>
