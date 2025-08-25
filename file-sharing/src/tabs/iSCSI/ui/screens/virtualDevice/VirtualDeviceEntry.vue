<template>
  <tr>
    <td>{{ device.deviceName }}</td>
    <td>{{ device.filePath }}</td>
    <td>{{ device.blockSize }}</td>
    <td>{{ getDeviceType() }}</td>
    <td v-if="useUserSettings().value.iscsi.clusteredServer">{{ device.assigned ? 'Yes' : 'No' }}</td>
    <td>{{ device.server?.host }}</td>
    <td class=" button-group-row justify-end">
      <button v-if="!useUserSettings().value.iscsi.clusteredServer" @click="promptDeletion">
        <span class="sr-only">Delete</span>
        <TrashIcon class="size-icon icon-danger" />
      </button>
      <!-- <button v-else disabled title="Deletion is disabled in clustered environemnts for safety.">
        <span class="sr-only">Delete</span>
        <TrashIcon class="size-icon icon-default" />
      </button> -->
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
import { RadosBlockDevice } from "@/tabs/iSCSI/types/cluster/RadosBlockDevice";
import { LogicalVolume } from "@/tabs/iSCSI/types/cluster/LogicalVolume";

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

const getDeviceType = () => {
  if (props.device instanceof RadosBlockDevice) {
    return `${props.device.deviceType} (RBD)`
  }
  else if (props.device instanceof LogicalVolume) {
    return `${props.device.deviceType} (LVM)`
  }
  else {
    return props.device.deviceType
  }
}

const actions = wrapActions({ deleteDevice });

const promptDeletion = confirmBeforeAction(
  { header: "Confirm", body: `Delete device ${props.device.deviceName}?` },
  actions.deleteDevice
);
</script>
