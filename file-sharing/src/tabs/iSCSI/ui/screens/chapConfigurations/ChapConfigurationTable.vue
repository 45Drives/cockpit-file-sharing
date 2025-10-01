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
        <ChapConfigurationEditor
          :target="target"
          :outgoingUserPresent="outgoingUserPresent"
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
          headerText="CHAP Configurations"
          emptyText="No CHAP configurations. Click '+' to add one."
          noScroll
          class="!border-none !shadow-none"
        >
          <template #thead>
            <tr>
              <th scope="col">Username</th>
              <th scope="col">Password</th>
              <th scope="col">Type</th>
              <th scope="col" class="flex flex-row justify-end">
                <span class="sr-only">Delete</span>
                <button @click="showEditor = !showEditor">
                  <PlusIcon class="size-icon icon-default" />
                </button>
              </th>
            </tr>
          </template>
          <template #tbody>
            <ChapConfigurationEntry
              v-for="(config, index) in target.chapConfigurations"
              :key="index"
              :config="config"
              :target="target"
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
import { computed, inject, ref } from "vue";
import { PlusIcon } from "@heroicons/vue/24/solid";
import type { ResultAsync } from "neverthrow";
import type { ProcessError } from "@45drives/houston-common-lib";
import type { Target } from "@/tabs/iSCSI/types/Target";
import type { ISCSIDriver } from "@/tabs/iSCSI/types/drivers/ISCSIDriver";
import { CHAPType } from "@/tabs/iSCSI/types/CHAPConfiguration";
import ChapConfigurationEntry from "@/tabs/iSCSI/ui/screens/chapConfigurations/ChapConfigurationEntry.vue";
import ChapConfigurationEditor from "@/tabs/iSCSI/ui/screens/chapConfigurations/ChapConfigurationEditor.vue";

const showEditor = ref(false);

const props = defineProps<{ target: Target }>();

const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver")!;

const outgoingUserPresent = computed(
  () =>
    props.target.chapConfigurations.find((config) => config.chapType === CHAPType.OutgoingUser) !==
    undefined
);

const refreshTable = () => {
  return driver.andThen((driver) => {
    return driver.getCHAPConfigurationsOfTarget(props.target).map((configs) => {
      props.target.chapConfigurations = configs;
    });
  });
};

const actions = wrapActions({ refreshTable: refreshTable });

//actions.refreshTable();
</script>
