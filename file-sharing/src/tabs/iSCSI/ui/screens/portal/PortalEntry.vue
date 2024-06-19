<template>
  <tr>
    <td>{{ portal.address }}</td>
    <td class="button-group-row justify-end">
      <button v-if="target.portals.length > 1" @click="promptDeletion">
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
import type { Target } from "@/tabs/iSCSI/types/Target";
import type { ISCSIDriver } from "@/tabs/iSCSI/types/drivers/ISCSIDriver";
import type { Portal } from "@/tabs/iSCSI/types/Portal";

const props = defineProps<{ target: Target; portal: Portal }>();

const emit = defineEmits(["deletePortal"]);

const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver")!;

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

const promptDeletion = confirmBeforeAction(
  { header: "Confirm", body: `Delete portal ${props.portal.address}?` },
  actions.deletePortal
);
</script>
