<template>
  <CardContainer>
    <div class="card">
      <div class="sm:shadow sm:rounded-lg sm:border sm:border-default overflow-hidden">
        <Table
          headerText="Sessions"
          emptyText="No current sessions."
          noScroll
          class="!border-none !shadow-none"
        >
          <template #thead>
            <tr>
              <th scope="col">Initiator Name</th>
              <th scope="col">Session Read Count</th>
              <th scope="col">Session Write Count</th>
              <th scope="col" class="justify-end"></th>
            </tr>
          </template>
          <template #tbody>
            <SessionEntry
              v-for="(session, index) in target.sessions"
              :key="index"
              :session="session"
            />
          </template>
        </Table>
      </div>
    </div>
  </CardContainer>
</template>

<script setup lang="ts">
import { CardContainer, wrapActions, Table } from "@45drives/houston-common-ui";
import { inject, onMounted, onUnmounted } from "vue";
import type { ResultAsync } from "neverthrow";
import type { ProcessError } from "@45drives/houston-common-lib";
import SessionEntry from "./SessionEntry.vue";
import type { Target } from "@/tabs/iSCSI/types/Target";
import type { ISCSIDriver } from "@/tabs/iSCSI/types/drivers/ISCSIDriver";

const props = defineProps<{ target: Target; currentlyOpen: boolean }>();

const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver")!;

let refreshTimer: number;

const refreshTable = () => {
  return driver.andThen((driver) => {
    return driver.getSessionsOfTarget(props.target).map((sessions) => {
      props.target.sessions = sessions;
    })
  });
};

onMounted(() => {
  refreshTimer = window.setInterval(() => {
    if (props.currentlyOpen) refreshTable();
  }, 1000);
});

onUnmounted(() => {
  window.clearInterval(refreshTimer);
});

const actions = wrapActions({ refreshTable: refreshTable });

actions.refreshTable();
</script>
