<template>
  <tr>
    <td>{{ device.deviceName }}</td>
    <td>{{ device.filePath }}</td>
    <td>{{ device.blockSize }}</td>
    <td>{{ device.deviceType }}</td>
    <td class="button-group-row justify-end">
      <button v-if="!useUserSettings().value.iscsi.clusteredServer" @click="promptDeletion">
        <span class="sr-only">Delete</span>
        <TrashIcon class="size-icon icon-danger" />
      </button>
    </td>
  </tr>
</template>

<script setup lang="ts">
import { VirtualDevice } from "@/tabs/iSCSI/types/VirtualDevice";
import { TrashIcon } from "@heroicons/vue/20/solid";
import { wrapActions, confirmBeforeAction } from "@45drives/houston-common-ui";
import { inject } from "vue";
import type { ISCSIDriver } from "@/tabs/iSCSI/types/drivers/ISCSIDriver";
import { ResultAsync } from "neverthrow";
import { ProcessError } from "@45drives/houston-common-lib";
import { useUserSettings } from "@/common/user-settings";

const props = defineProps<{ device: VirtualDevice }>();

const emit = defineEmits(["deleteDevice"]);

const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver")!

const deleteDevice = () => {
  return driver
    .andThen((driver) => driver.removeVirtualDevice(props.device))
    .map(() => emit("deleteDevice"))
    .mapErr(
      (error) =>
        new ProcessError(`Unable to delete device ${props.device.deviceName}: ${error.message}`)
    );
};

const actions = wrapActions({ deleteDevice });

const promptDeletion = confirmBeforeAction(
  { header: "Confirm", body: `Delete device ${props.device.deviceName}?` },
  actions.deleteDevice
);
</script>
