<template>
  <CardContainer>
    <template v-slot:header> Targets </template>
    <div
      class="overflow-hidden"
      :style="{
        'max-height': showAddTarget ? '1500px' : '0',
        transition: showAddTarget ? 'max-height 0.5s ease-in' : 'max-height 0.5s ease-out',
      }"
    >
      <div class="card">
        <TargetEditor
          :existing-targets="targets"
          @close-editor="
            () => {
              showAddTarget = false;
              actions.refreshTargets();
            }
          "
        />
      </div>
    </div>
    <div class="card">
      <div class="sm:shadow sm:rounded-lg sm:border sm:border-default overflow-hidden">
        <Table
          emptyText="No targets. Click '+' to add one."
          noScroll
          noHeader
          noShrink
          noShrinkHeight="h-120"
          class="!border-none !shadow-none"
        >
          <template #thead>
            <tr>
              <th scope="col">Target Name</th>
              <th scope="col" class="flex flex-row justify-end">
                <span class="sr-only">Edit/Delete</span>
                <button @click="showAddTarget = !showAddTarget">
                  <PlusIcon class="size-icon icon-default" />
                </button>
              </th>
            </tr>
          </template>
          <template #tbody>
            <TargetEntry
              v-for="(target, index) in targets"
              :key="index"
              :target="target"
              @deleteTarget="actions.refreshTargets"
            />
          </template>
        </Table>
      </div>
    </div>
  </CardContainer>
</template>

<script setup lang="ts">
import { CardContainer, wrapActions } from "@45drives/houston-common-ui";
import { inject, ref, watch } from "vue";
import Table from "../Table.vue";
import { PlusIcon } from "@heroicons/vue/24/solid";
import TargetEntry from "../target/TargetEntry.vue";
import { ProcessError } from "@45drives/houston-common-lib";
import type { Target } from "@/tabs/iSCSI/types/Target";
import TargetEditor from "../target/TargetEditor.vue";
import type { ResultAsync } from "neverthrow";
import type { ISCSIDriver } from "@/tabs/iSCSI/types/drivers/ISCSIDriver";

const targets = ref<Target[]>([]);

const showAddTarget = ref(false);

const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver")!;

const forceRefreshRecords = inject<Record<string, boolean>>("forceRefreshRecords")!;

watch(forceRefreshRecords, () => {
  if (forceRefreshRecords["targets"]) {
    refreshTargets();
    forceRefreshRecords["targets"] = false;
  }
});

const refreshTargets = () => {
  return driver.andThen((driver) => {
    return driver.getTargets().map((targetList) => {
      targets.value = targetList;
    });
  });
};

const actions = wrapActions({ refreshTargets: refreshTargets });

actions.refreshTargets();
</script>
