<template>
  <tr>
    <td>{{ portal.address }}</td>
    <td class="button-group-row justify-end">
      <button v-if="!(useUserSettings().value.iscsi.clusteredServer && target.portals.length <= 1)"
        @click="promptDeletion" :disabled="!canCreate">
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
import type { Target } from "@/tabs/iSCSI/types/Target";
import type { ISCSIDriver } from "@/tabs/iSCSI/types/drivers/ISCSIDriver";
import type { Portal } from "@/tabs/iSCSI/types/Portal";
import { useUserSettings } from "@/common/user-settings";

const props = defineProps<{ target: Target; portal: Portal }>();

const emit = defineEmits(["deletePortal"]);

const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver")!;
const canEditIscsi = inject<Ref<boolean>>("canEditIscsi");
if (!canEditIscsi) throw new Error("canEditIscsi not provided");
const canCreate = computed(() => canEditIscsi.value);

const deletePortal = () => {
  return driver
    .andThen((driver) => driver.deletePortalFromTarget(props.target, props.portal))
    .map(() => emit("deletePortal"))
    .mapErr(
      (error) =>
        new ProcessError(`Unable to delete portal ${props.portal.address}: ${error.message}`)
    );
};

const actions = wrapActions({ deletePortal });

const deletionBody = computed(() => {
  const base = `Delete initiator group "${props.portal.address}"?`;

  const clusteredWarning = `Deleting this portal may restart related resources and disrupt active sessions. Recommended to perform during a maintenance window.
`;
  const isClustered = useUserSettings().value.iscsi.clusteredServer === true;

  return isClustered ? `${base}\n${clusteredWarning.trim()}` : base;
});

const promptDeletion = confirmBeforeAction(
  {
    header: "Confirm",
    body: deletionBody.value,
    dangerous: true
  },
  actions.deletePortal
);

</script>
