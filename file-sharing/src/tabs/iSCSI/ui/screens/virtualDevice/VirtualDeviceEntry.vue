<template>
  <tr>
    <td class="max-w-40 truncate" :title="device.deviceName">{{ device.deviceName }}</td>
    <td class="max-w-40 truncate" :title="device.filePath">{{ device.filePath }}</td>
    <td v-if="useUserSettings().value.iscsi.clusteredServer">{{ `${_cockpit.format_bytes(device.maximumSize)} ` }}</td>
    <td v-else>{{ device.blockSize }}</td>

    <td>{{ getDeviceType() }}</td>
    <td>{{ device.assigned ? 'Yes' : 'No' }}</td>

    <td v-if="useUserSettings().value.iscsi.clusteredServer"> {{ displayServerAddress(device.server) }}</td>
    <td v-if="useUserSettings().value.iscsi.clusteredServer" class="button-group-row justify-end">
      <button @click="showExpandScreen = true">
        <span class="sr-only">Resize</span>
        <WrenchIcon class="size-icon icon-default" />
      </button>
    </td>
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

  <Modal :show="showExpandScreen" @click-outside="showExpandScreen = false">
    <RBDExpansionScreen :device="device" @close="showExpandScreen = false; emit('update');" />
  </Modal>

</template>

<script setup lang="ts">
import { VirtualDevice } from "@/tabs/iSCSI/types/VirtualDevice";
import { TrashIcon } from "@heroicons/vue/20/solid";
import { wrapActions, confirmBeforeAction } from "@45drives/houston-common-ui";
import { inject, ref, reactive } from "vue";
import type { ISCSIDriver } from "@/tabs/iSCSI/types/drivers/ISCSIDriver";
import { ResultAsync } from "neverthrow";
import { ProcessError } from "@45drives/houston-common-lib";
import { useUserSettings } from "@/common/user-settings";
import { RadosBlockDevice } from "@/tabs/iSCSI/types/cluster/RadosBlockDevice";
import { LogicalVolume } from "@/tabs/iSCSI/types/cluster/LogicalVolume";
import RBDExpansionScreen from "@/tabs/iSCSI/ui/screens/radosBlockDeviceManagement/RBDExpansionScreen.vue";
import { Modal } from "@45drives/houston-common-ui";
import { WrenchIcon } from "@heroicons/vue/20/solid";

const props = defineProps<{
  device: VirtualDevice | RadosBlockDevice | LogicalVolume
}>();
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const _cockpit = cockpit;

const _ = cockpit.gettext;

const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver")!
const serverAddr = reactive(new Map<object, string>());
const showExpandScreen = ref(false);

const emit = defineEmits<{
  (e: 'update'): void;
  (e: 'selectDevice', value: VirtualDevice): void;
  (e: 'deleteDevice', value: VirtualDevice): void;

}>();

function displayServerAddress(s?: any /* Server */): string {
  if (!s) return "";
  const host = s.host ?? "";
  if (!localHosts.has(host)) return host;

  const cached = serverAddr.get(s) ?? s.ipAddress ?? s.ipaddress; // whichever your class exposes
  return cached || host; // fallback to host until we resolve
}

const deleteDevice = () => {
  return driver
    .andThen(d => d.removeVirtualDevice(props.device))
    .map(() => {
      // No-payload version:
      emit("deleteDevice");

      // If using payload typing instead:
      // emit("deleteDevice", props.device as VirtualDevice);
    })
    .mapErr(err =>
      new ProcessError(`Unable to delete device ${props.device.deviceName}: ${err.message}`)
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
