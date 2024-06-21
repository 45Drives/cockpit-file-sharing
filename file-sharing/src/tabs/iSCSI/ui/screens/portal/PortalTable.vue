<template>
  <CardContainer>
    <div
      class="overflow-hidden"
      :style="{
        'max-height': showAddPortal ? '1500px' : '0',
        transition: showAddPortal ? 'max-height 0.5s ease-in' : 'max-height 0.5s ease-out',
      }"
    >
      <div class="card">
        <PortalEditor
          :target="props.target"
          @close-editor="
            () => {
              showAddPortal = false;
              actions.refreshPortals();
            }
          "
        />
      </div>
    </div>
    <div class="card">
      <div class="sm:shadow sm:rounded-lg sm:border sm:border-default overflow-hidden">
        <Table
          headerText="Portals"
          emptyText="No portals. Click '+' to add one."
          noScroll
          class="!border-none !shadow-none"
        >
          <template #thead>
            <tr>
              <th scope="col">Address</th>
              <th scope="col" class="flex flex-row justify-end">
                <span class="sr-only">Delete</span>
                <button @click="showAddPortal = !showAddPortal">
                  <PlusIcon class="size-icon icon-default" />
                </button>
              </th>
            </tr>
          </template>
          <template #tbody>
            <PortalEntry
              v-for="(portal, index) in target.portals"
              :key="index"
              :target="target"
              :portal="portal"
              @deletePortal="actions.refreshPortals"
            />
          </template>
        </Table>
      </div>
    </div>
  </CardContainer>
</template>

<script setup lang="ts">
import { CardContainer, wrapActions } from "@45drives/houston-common-ui";
import { inject, ref, type Ref } from "vue";
import Table from "../Table.vue";
import { PlusIcon } from "@heroicons/vue/24/solid";
import type { ResultAsync } from "neverthrow";
import type { ProcessError } from "@45drives/houston-common-lib";
import type { Target } from "@/tabs/iSCSI/types/Target";
import type { ISCSIDriver } from "@/tabs/iSCSI/types/drivers/ISCSIDriver";
import PortalEntry from "@/tabs/iSCSI/ui/screens/portal/PortalEntry.vue";
import PortalEditor from "@/tabs/iSCSI/ui/screens/portal/PortalEditor.vue";

const showAddPortal = ref(false);

const props = defineProps<{ target: Target }>();

const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver")!;

const refreshPortals = () => {
  return driver.andThen((driver) => {
    return driver.getPortalsOfTarget(props.target).map((portals) => {
      props.target.portals = portals;
    });
  });
};

const actions = wrapActions({ refreshPortals: refreshPortals });

actions.refreshPortals();
</script>
