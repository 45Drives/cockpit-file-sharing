<template>
  <CardContainer>
    <div
      class=""
      :style="{
        'max-height': showEditor ? '1500px' : '0',
        transition: showEditor ? 'max-height 0.5s ease-in' : 'max-height 0.5s ease-out',
      }"
    >
      <div class="card">
        <LogicalUnitNumberEditor
          v-if="showEditor"
          ref="logicalUnitNumberEditor"
          :initiatorGroup="initiatorGroup"
          @close-editor="
            () => {
              showEditor = false;
              actions.refreshTable();
            }
          "
        />
      </div>
    </div>
    <div class="card">
      <div class="sm:shadow sm:rounded-lg sm:border sm:border-default overflow-hidden">
        <Table
          headerText="LUNs"
          emptyText="No LUNs. Click '+' to add one."
          noScroll
          class="!border-none !shadow-none"
        >
          <template #thead>
            <tr>
              <th scope="col">Device</th>
              <th scope="col">Number</th>
              <th scope="col" class="flex flex-row justify-end">
                <span class="sr-only">Add Lun</span>
                <button @click="toggleEditor">
                  <PlusIcon class="size-icon icon-default" />
                </button>
              </th>
            </tr>
          </template>
          <template #tbody>
            <LogicalUnitNumberEntry
              v-for="(lun, index) in initiatorGroup.logicalUnitNumbers"
              :key="index"
              :logicalUnitNumber="lun"
              :initiatorGroup="initiatorGroup"
              @deleteEntry="actions.refreshTable"
              @lunDeleted="removeVirtualDevice"
            />
          </template>
        </Table>
      </div>
    </div>
  </CardContainer>
</template>

<script setup lang="ts">
import { CardContainer, wrapActions, Table } from "@45drives/houston-common-ui";
import { inject, ref, watch, type Ref } from "vue";
import { PlusIcon } from "@heroicons/vue/24/solid";
import type { ResultAsync } from "neverthrow";
import type { ProcessError } from "@45drives/houston-common-lib";
import type { InitiatorGroup } from "@/tabs/iSCSI/types/InitiatorGroup";
import type { VirtualDevice } from "@/tabs/iSCSI/types/VirtualDevice";
import type { ISCSIDriver } from "@/tabs/iSCSI/types/drivers/ISCSIDriver";
import LogicalUnitNumberEntry from "@/tabs/iSCSI/ui/screens/logicalUnitNumbers/LogicalUnitNumberEntry.vue";
import LogicalUnitNumberEditor from "@/tabs/iSCSI/ui/screens/logicalUnitNumbers/LogicalUnitNumberEditor.vue";

const showEditor = ref(false);

const props = defineProps<{ initiatorGroup: InitiatorGroup }>();
const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver")!;

const virtualDevices = inject<Ref<VirtualDevice[]>>("virtualDevices");

const logicalUnitNumberEditor = ref<InstanceType<typeof LogicalUnitNumberEditor>>();

if (virtualDevices === undefined) {
  throw new Error("Virtual Device list is null");
}

watch(virtualDevices, () => {
  refreshTable();
});

function removeVirtualDevice(deviceName?: string) {
  if (!deviceName) return;

  const index = virtualDevices.value.findIndex(
    (device) => device.deviceName === deviceName
  );
  if (index !== -1) {
    virtualDevices.value.splice(index, 1);
  }
}


const refreshTable = () => {
  return driver.andThen((driver) =>
    driver.getLogicalUnitNumbersOfInitiatorGroup(props.initiatorGroup)
      .map((luns) => {
        props.initiatorGroup.logicalUnitNumbers.splice(
          0,
          props.initiatorGroup.logicalUnitNumbers.length,
          ...luns
        );
      })
      .andThen(() =>
        driver.getVirtualDevices().map((devices) => {
          virtualDevices.value = devices; 
        })
      )
  );
};
const toggleEditor = () => {
  showEditor.value = !showEditor.value;
  if (logicalUnitNumberEditor.value !== undefined)
    logicalUnitNumberEditor.value.populateNextNumber();
}

const actions = wrapActions({ refreshTable: refreshTable });

actions.refreshTable();
</script>
