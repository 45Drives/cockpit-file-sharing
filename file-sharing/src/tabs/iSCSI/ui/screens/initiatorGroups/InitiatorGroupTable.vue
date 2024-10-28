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
        <InitiatorGroupEditor
          :target="target"
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
          headerText="Initiator Groups"
          emptyText="No initiator groups. Click '+' to add one."
          noScroll
          shrink-height="h-160"
          class="!border-none !shadow-none"
        >
          <template #thead>
            <tr>
              <th scope="col">Group Name</th>
              <th scope="col" :class="{'flex flex-row': !useUserSettings().value.iscsi.clusteredServer, 'justify-end': true} ">
                <span class="sr-only">Delete</span>
                <button @click="showEditor = !showEditor" v-if="!useUserSettings().value.iscsi.clusteredServer">
                  <PlusIcon class="size-icon icon-default" />
                </button>
              </th>
            </tr>
          </template>
          <template #tbody>
            <InitiatorGroupEntry
              v-for="(group, index) in target.initiatorGroups"
              :key="index"
              :target="target"
              :initiatorGroup="group"
              @deleteEntry="actions.refreshTable"
            />
          </template>
        </Table>
      </div>
    </div>
  </CardContainer>
</template>

<script setup lang="ts">
import { CardContainer, wrapActions, Table } from "@45drives/houston-common-ui";
import { inject, ref, type Ref } from "vue";
import { PlusIcon } from "@heroicons/vue/24/solid";
import { useUserSettings } from "@/common/user-settings";
import type { ResultAsync } from "neverthrow";
import type { ProcessError } from "@45drives/houston-common-lib";
import type { Target } from "@/tabs/iSCSI/types/Target";
import type { ISCSIDriver } from "@/tabs/iSCSI/types/drivers/ISCSIDriver";
import InitiatorGroupEntry from "@/tabs/iSCSI/ui/screens/initiatorGroups/InitiatorGroupEntry.vue";
import InitiatorGroupEditor from "@/tabs/iSCSI/ui/screens/initiatorGroups/InitiatorGroupEditor.vue";

const showEditor = ref(false);

const props = defineProps<{ target: Target }>();

const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver")!;

if (driver === undefined) {
  throw new Error("iSCSI Driver is null");
}

const refreshTable = () => {
  return driver.andThen((driver) => {
    return driver.getInitatorGroupsOfTarget(props.target).map((groups) => {
      props.target.initiatorGroups = groups;
    });
  });
};

const actions = wrapActions({ refreshTable: refreshTable });

actions.refreshTable();
</script>
