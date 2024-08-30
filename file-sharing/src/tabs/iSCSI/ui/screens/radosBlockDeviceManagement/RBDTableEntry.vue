<template>
  <tr>
    <td>{{ getDeviceName() }}</td>
    <td>{{ getDeviceClassName() }}</td>
    <td>{{ _cockpit.format_bytes(device.maximumSize) }}</td>
    <td class="button-group-row justify-end">
      <button @click="showExpandScreen = true">
        <span class="sr-only">Resize</span>
        <WrenchIcon class="size-icon icon-default" />
      </button>
      <button @click="">
        <span class="sr-only">Add</span>
        <PlusIcon class="size-icon icon-default" />
      </button>
    </td>
  </tr>

  <Modal :show="showExpandScreen" @click-outside="showExpandScreen = false">
    <RBDExpansionScreen :device="device" @close="showExpandScreen = false; emit('update');"/>
  </Modal>
</template>

<script setup lang="ts">
import { WrenchIcon } from "@heroicons/vue/20/solid";
import { RadosBlockDevice } from "@/tabs/iSCSI/types/cluster/RadosBlockDevice";
import { LogicalVolume } from "@/tabs/iSCSI/types/cluster/LogicalVolume";
import { ref } from 'vue';
import RBDExpansionScreen from "@/tabs/iSCSI/ui/screens/radosBlockDeviceManagement/RBDExpansionScreen.vue";
import { Modal } from "@45drives/houston-common-ui";
import { PlusIcon } from "@heroicons/vue/24/solid";

const _cockpit = cockpit;

const props = defineProps<{
  device: RadosBlockDevice | LogicalVolume;
}>();

const showExpandScreen = ref(false);

const emit = defineEmits(['update']);

function getDeviceName() {
  return props.device.deviceName;
}

function getDeviceClassName() {
  if (props.device instanceof RadosBlockDevice) 
    return "RBD";
  else 
    return `LVM RBD (${props.device.volumeGroup.volumes.length})`;
}
</script>
