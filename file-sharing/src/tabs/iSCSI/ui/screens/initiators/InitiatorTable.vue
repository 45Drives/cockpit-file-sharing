<template>
  <CardContainer>
    <div
      class="overflow-hidden"
      :style="{
        'max-height': showEditor ? '1500px' : '0',
        transition: showEditor ? 'max-height 0.5s ease-in' : 'max-height 0.5s ease-out',
      }"
    >
      <div class="card">
        <InitiatorEditor
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
          headerText="Initiators"
          emptyText="No initiators. Click '+' to add one."
          noScroll
          class="!border-none !shadow-none"
        >
          <template #thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col" class="flex flex-row justify-end">
                <span class="sr-only">Delete</span>
                <button @click="showEditor = !showEditor">
                  <PlusIcon class="size-icon icon-default" />
                </button>
              </th>
            </tr>
          </template>
          <template #tbody>
            <InitiatorEntry
              v-for="(initiator, index) in initiatorGroup.initiators"
              :key="index"
              :initiatorGroup="initiatorGroup"
              :initiator="initiator"
              @deleteEntry="actions.refreshTable"
            />
          </template>
        </Table>
      </div>
    </div>
  </CardContainer>
</template>

<script setup lang="ts">
import { CardContainer, wrapActions } from "@45drives/houston-common-ui";
import { inject, ref } from "vue";
import Table from "../Table.vue";
import { PlusIcon } from "@heroicons/vue/24/solid";
import type { ResultAsync } from "neverthrow";
import type { ProcessError } from "@45drives/houston-common-lib";
import type { InitiatorGroup } from "@/tabs/iSCSI/types/InitiatorGroup";
import type { ISCSIDriver } from "@/tabs/iSCSI/types/drivers/ISCSIDriver";
import InitiatorEntry from "@/tabs/iSCSI/ui/screens/initiators/InitiatorEntry.vue";
import InitiatorEditor from "@/tabs/iSCSI/ui/screens/initiators/InitiatorEditor.vue";

const showEditor = ref(false);

const props = defineProps<{ initiatorGroup: InitiatorGroup }>();

const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver");

if (driver === undefined) {
  throw new Error("iSCSI Driver is null");
}

const refreshTable = () => {
  return driver.andThen((driver) => {
    return driver.getInitiatorsOfInitiatorGroup(props.initiatorGroup).map((initiators) => {
      props.initiatorGroup.initiators = initiators;
    });
  });
};

const actions = wrapActions({ refreshTable: refreshTable });

actions.refreshTable();
</script>
