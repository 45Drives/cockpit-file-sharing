<script setup lang="ts">
import {
  CardContainer,
  CenteredCardColumn,
  SelectMenu,
  Table,
  assertConfirm,
  computedResult,
  reportSuccess,
  wrapActions,
  type SelectMenuOption,
} from "@45drives/houston-common-ui";
import { getServer } from "@45drives/houston-common-lib";
import { ArrowPathIcon } from "@heroicons/vue/20/solid";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

import { ConnectedClientsManager } from "@/tabs/connected-clients/connected-clients-manager";
import type {
  ClientProtocol,
  ConnectedClient,
} from "@/tabs/connected-clients/data-types";
import { useUserSettings } from "@/common/user-settings";

const _ = cockpit.gettext;

const userSettings = useUserSettings();

const server = getServer();
const manager = server.map((s) => new ConnectedClientsManager(s));

type Filter = "all" | ClientProtocol;
const filter = ref<Filter>("all");
const filterOptions: SelectMenuOption<Filter>[] = [
  { label: _("All"), value: "all" },
  { label: _("Samba"), value: "samba" },
  { label: _("NFS"), value: "nfs" },
];

const [clients, reloadClients] = computedResult<ConnectedClient[]>(
  () => manager.andThen((m) => m.getClients()),
  []
);

const filteredClients = computed(() =>
  filter.value === "all"
    ? clients.value
    : clients.value.filter((c) => c.protocol === filter.value)
);

const refreshIntervalSeconds = computed(
  () => userSettings.value.connectedClients.refreshIntervalSeconds
);

let refreshTimer: number | undefined;
const startTimer = () => {
  if (refreshTimer !== undefined) window.clearInterval(refreshTimer);
  const ms = Math.max(1, refreshIntervalSeconds.value) * 1000;
  refreshTimer = window.setInterval(() => {
    // Background polling: silence errors so a chronic failure doesn't spam
    // notifications every tick. Manual refresh (below) still surfaces them.
    reloadClients().mapErr(() => undefined);
  }, ms);
};

onMounted(startTimer);
onUnmounted(() => {
  if (refreshTimer !== undefined) window.clearInterval(refreshTimer);
});
watch(refreshIntervalSeconds, startTimer);

const kickClient = (client: ConnectedClient) => {
  const label = client.hostname ? `${client.hostname} (${client.ip})` : client.ip;
  return assertConfirm({
    header: _("Disconnect Samba client?"),
    body:
      _("All open sessions and file handles from") +
      ` ${label} ` +
      _("will be closed. The client may reconnect automatically."),
    dangerous: true,
  })
    .andThen(() => manager)
    .andThen((m) => m.kickSamba(client.ip))
    .andThen(() => reloadClients())
    .map(() => reportSuccess(_("Disconnected") + ` ${label}`));
};

const actions = wrapActions({
  reloadClients,
  kickClient,
});

const formatDate = (d: Date | null): string => (d ? d.toLocaleString() : "—");
const fallback = (v: string | null | undefined): string =>
  v && v.length > 0 ? v : "—";
</script>

<template>
  <CenteredCardColumn>
    <CardContainer>
      <template #header>
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <span>{{ _("Connected Clients") }}</span>
          <div class="flex items-center gap-2">
            <SelectMenu v-model="filter" :options="filterOptions" />
            <button
              class="btn btn-secondary inline-flex flex-row items-center gap-1"
              @click="actions.reloadClients()"
              :title="_('Refresh now')"
            >
              <ArrowPathIcon class="size-icon icon-default" />
              <span>{{ _("Refresh") }}</span>
            </button>
          </div>
        </div>
      </template>
      <div class="card">
        <!-- noScroll + outer overflow-x-auto + contain:layout: the houston-common-ui
             Table's default scroll wrapper leaks the table's natural width up to
             <html>, which combined with SelectMenu's scrollIntoView() causes the
             page to scroll horizontally when the dropdown opens. Keeping the
             scroll container at this level (and isolating layout) avoids it. -->
        <div class="sm:shadow sm:rounded-lg sm:border sm:border-default overflow-x-auto [contain:layout]">
          <Table
            noScroll
            :emptyText='_("No connected clients.")'
            class="!border-none !shadow-none"
          >
            <template #thead>
              <tr>
                <th scope="col">{{ _("Protocol") }}</th>
                <th scope="col">{{ _("User") }}</th>
                <th scope="col">{{ _("Client") }}</th>
                <th scope="col">{{ _("Version") }}</th>
                <th scope="col">{{ _("Share") }}</th>
                <th scope="col">{{ _("Connected since") }}</th>
                <th scope="col">{{ _("Open files") }}</th>
                <th scope="col">{{ _("Encrypted") }}</th>
                <th scope="col" class="justify-end"><span class="sr-only">Actions</span></th>
              </tr>
            </template>
            <template #tbody>
              <tr v-for="client in filteredClients" :key="client.id">
                <td>
                  <span class="uppercase font-mono text-sm">{{ client.protocol }}</span>
                </td>
                <td>{{ fallback(client.user) }}</td>
                <td>
                  <div class="flex flex-col">
                    <span class="font-mono">{{ client.ip }}</span>
                    <span v-if="client.hostname" class="muted-text text-sm">
                      {{ client.hostname }}
                    </span>
                  </div>
                </td>
                <td class="font-mono text-sm">{{ client.protocolVersion }}</td>
                <td>{{ fallback(client.share) }}</td>
                <td>{{ formatDate(client.connectedSince) }}</td>
                <td>{{ client.openFiles }}</td>
                <td>{{ client.encrypted ? _("Yes") : _("No") }}</td>
                <td class="button-group-row justify-end">
                  <button
                    v-if="client.protocol === 'samba'"
                    class="btn btn-secondary btn-sm"
                    @click="actions.kickClient(client)"
                  >
                    {{ _("Disconnect") }}
                  </button>
                </td>
              </tr>
            </template>
          </Table>
        </div>
      </div>
    </CardContainer>
  </CenteredCardColumn>
</template>
