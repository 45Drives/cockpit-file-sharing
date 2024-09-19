<template>
  <CardContainer
  :style="{'width': '1000px'}">
    <RBDTable
      @select-device="selectVirtualDevice"/>

    <template v-slot:footer>
      <div class="button-group-row justify-end grow">
        <button
          class="btn btn-secondary"
          @click="emit('close')"
        >{{ ("Close") }}</button>
      </div>
    </template>
  </CardContainer>
</template>

<script setup lang="ts">
import { VirtualDevice } from "@/tabs/iSCSI/types/VirtualDevice";
import RBDTable from "@/tabs/iSCSI/ui/screens/radosBlockDeviceManagement/RBDTable.vue";
import {
  CardContainer
} from "@45drives/houston-common-ui";

const _ = cockpit.gettext;

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'selectDevice', value: VirtualDevice): void;
}>();

const selectVirtualDevice = (device: VirtualDevice) => {
  emit('selectDevice', device)
}

</script>