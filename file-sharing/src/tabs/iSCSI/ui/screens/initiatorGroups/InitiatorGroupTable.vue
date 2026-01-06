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
          @close-editor="() => { showEditor = false; }"
          @created="actions.refreshTable()"
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
              <th scope="col" class="flex flex-row justify-end">
                <span class="sr-only">Delete</span>
                <button @click="showEditor = !showEditor" :disabled="!canCreate">
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
              @groupWillDelete="rememberFreed"
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
import { computed, inject, ref, type Ref } from "vue";
import { PlusIcon } from "@heroicons/vue/24/solid";
import type { ResultAsync } from "neverthrow";
import { okAsync } from "neverthrow";
import type { ProcessError } from "@45drives/houston-common-lib";
import type { Target } from "@/tabs/iSCSI/types/Target";
import type { ISCSIDriver } from "@/tabs/iSCSI/types/drivers/ISCSIDriver";
import InitiatorGroupEntry from "@/tabs/iSCSI/ui/screens/initiatorGroups/InitiatorGroupEntry.vue";
import InitiatorGroupEditor from "@/tabs/iSCSI/ui/screens/initiatorGroups/InitiatorGroupEditor.vue";
import type { VirtualDevice } from "@/tabs/iSCSI/types/VirtualDevice";

const virtualDevices = inject<Ref<VirtualDevice[]>>("virtualDevices")!;
const showEditor = ref(false);
const props = defineProps<{ target: Target }>();
const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver")!;
if (driver === undefined) {
  throw new Error("iSCSI Driver is null");
}

// Keep track of devices that should become free after deletion completes
const pendingFreedPaths = ref<Set<string>>(new Set());

// Called by child before it deletes a group
const rememberFreed = (paths: string[]) => {
  paths.forEach((p) => pendingFreedPaths.value.add(p));
};
const canEditIscsi = inject<Ref<boolean>>("canEditIscsi");
if (!canEditIscsi) throw new Error("canEditIscsi not provided");
const canCreate = computed(() => canEditIscsi.value);

const refreshTable = () => {
  return driver.andThen((d) =>
    d.getInitatorGroupsOfTarget(props.target)
      .map((groups) => {
        props.target.initiatorGroups = groups;
      })
      .andThen(() => {
  if (pendingFreedPaths.value.size > 0) {
    const toRemove = pendingFreedPaths.value;

    // mutate in place so any other references (like the driver's cache) see the change
    const arr = virtualDevices.value;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (toRemove.has(arr[i].filePath)) {
        arr.splice(i, 1);
      }
    }

    pendingFreedPaths.value.clear();
    return okAsync<void, ProcessError>(undefined);
  }

  return d.getVirtualDevices().map((devices) => {
    virtualDevices.value = devices;
  });
})
  );
};
const actions = wrapActions({ refreshTable });

// Optionally call once on mount:
// actions.refreshTable();
</script>