
<template>
    <CardContainer>
    <template v-slot:header> 
      <div class="card-header flex flex-row items-center gap-2">
        <div class="text-header">{{ _("RBD/LVs") }}</div>
        <LoadingSpinner
            v-if="fetchingDevices"
        />
      </div>
    </template>
    <div
      class="overflow-hidden"
      :style="{
        'max-height': showAddRBD ? '1500px' : '0',
        transition: showAddRBD ? 'max-height 0.5s ease-in' : 'max-height 0.5s ease-out',
      }"
    >
      <div class="card">
        <RBDDeviceCreationScreen
        @created="selectVirtualDevice"
        @close="showAddRBD = false"/>
      </div>
    </div>
    <div class="card">
      <div class="sm:shadow sm:rounded-lg sm:border sm:border-default overflow-hidden">
        <Table
          headerText="Devices"
          :emptyText='(fetchingDevices && deviceList.length === 0) ? "Fetching devices..." : "No avaliable devices."'
          noScroll
          class="!border-none !shadow-none"
        >
          <template #thead>
            <tr>
              <th scope="col">Device</th>
              <th scope="col">Type</th>
              <th scope="col">Size</th>
              <th scope="col" class="flex flex-row justify-end">
                <span class="sr-only">Expand Device</span>
                <button @click="showAddRBD = !showAddRBD">
                  <PlusIcon class="size-icon icon-default" />
                </button>
              </th>
            </tr>
          </template>
          <template #tbody>
            <RBDTableEntry
              v-for="(device, index) in deviceList"
              :key="index"
              :device="device"
              @update="actions.fetchDevices"
              @select-device="selectVirtualDevice"
            />
          </template>
        </Table>
      </div>
    </div>
  </CardContainer>
</template>

<script setup lang="ts">
import { LogicalVolume } from "@/tabs/iSCSI/types/cluster/LogicalVolume";
import { RadosBlockDevice } from "@/tabs/iSCSI/types/cluster/RadosBlockDevice";
import type { ISCSIDriverClusteredServer } from "@/tabs/iSCSI/types/drivers/ISCSIDriverClusteredServer";
import { VirtualDevice } from "@/tabs/iSCSI/types/VirtualDevice";
import RBDDeviceCreationScreen from "@/tabs/iSCSI/ui/screens/radosBlockDeviceManagement/RBDDeviceCreationScreen.vue";
import RBDTableEntry from "@/tabs/iSCSI/ui/screens/radosBlockDeviceManagement/RBDTableEntry.vue";
import type { ProcessError } from "@45drives/houston-common-lib";
import {
    CardContainer,
    LoadingSpinner,
    Table,
    wrapActions,
} from "@45drives/houston-common-ui";
import { PlusIcon } from "@heroicons/vue/24/solid";
import { type ResultAsync } from "neverthrow";
import { inject, ref } from "vue";

const _ = cockpit.gettext;

const emit = defineEmits<{
  (e: 'selectDevice', value: VirtualDevice): void;
}>();

const showAddRBD = ref(false);

const driver = inject<ResultAsync<ISCSIDriverClusteredServer, ProcessError>>("iSCSIDriver")!;

const deviceList = ref<(RadosBlockDevice|LogicalVolume)[]>([]);

const fetchingDevices = ref<boolean>(false);

const fetchDevices = () => {
  let rbdDeviceList: RadosBlockDevice[] = [];

  fetchingDevices.value = true;

  return driver.andThen((driver) => 
    driver.rbdManager.fetchAvaliableRadosBlockDevices()
    .map((rbdDevices) => rbdDeviceList = rbdDevices)
    .andThen(() => driver.rbdManager.fetchAvaliableLogicalVolumes())
    .map((lvDevices) => {
      deviceList.value = lvDevices;

      fetchingDevices.value = false;
    })
  );
}

const selectVirtualDevice = (device: VirtualDevice) => {
  showAddRBD.value = false;
  emit('selectDevice', device)
}

const actions = wrapActions({fetchDevices});

actions.fetchDevices();

function checkLogicalVolumeForRBD(rbd: RadosBlockDevice, volume: LogicalVolume) {
  for (const physicalVolume of volume.volumeGroup.volumes) {
    if (physicalVolume.rbd.filePath === rbd.filePath) {
      return true;
    }
  }

  return false;
}

</script>