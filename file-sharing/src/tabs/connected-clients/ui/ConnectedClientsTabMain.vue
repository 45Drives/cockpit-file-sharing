<script setup lang="ts">
import {
  CardContainer,
  CenteredCardColumn,
  Notification,
  SelectMenu,
  Table,
  assertConfirm,
  computedResult,
  pushNotification,
  reportSuccess,
  wrapActions,
  type SelectMenuOption,
} from "@45drives/houston-common-ui";
import { getServer } from "@45drives/houston-common-lib";
import {
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@heroicons/vue/20/solid";
import { okAsync } from "neverthrow";
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

const [clients, reloadClients] = computedResult<ConnectedClient[]>(
  () => manager.andThen((m) => m.getClients()),
  []
);

// Diff successive polls to fire connect/disconnect toasts. Rows are
// aggregated by logical client (protocol + user + IP) in the manager, so
// client.id IS the logical-client key here — no further grouping needed.
// `null` baseline = no diff yet (first load just records, never notifies);
// baseline updates regardless of notifyOnChange so toggling that setting
// on doesn't backfire stale events.
const previousByID = ref<Map<string, ConnectedClient> | null>(null);
const clientLabel = (c: ConnectedClient): string => {
  const who = c.hostname ?? c.ip;
  return c.user ? `${c.user}@${who}` : who;
};
watch(clients, (newClients) => {
  const newMap = new Map(newClients.map((c) => [c.id, c]));
  const prev = previousByID.value;
  if (prev !== null && userSettings.value.connectedClients.notifyOnChange) {
    for (const c of newClients) {
      if (!prev.has(c.id)) {
        pushNotification(
          new Notification(_("Client connected"), clientLabel(c), "info")
        );
      }
    }
    for (const [id, c] of prev) {
      if (!newMap.has(id)) {
        pushNotification(
          new Notification(_("Client disconnected"), clientLabel(c), "warning")
        );
      }
    }
  }
  previousByID.value = newMap;
});

const filteredClients = computed(() =>
  filter.value === "all"
    ? clients.value
    : clients.value.filter((c) => c.protocol === filter.value)
);

type SortField =
  | "protocol"
  | "user"
  | "ip"
  | "protocolVersion"
  | "share"
  | "connectedSince"
  | "openFiles"
  | "encrypted";
type SortDir = "asc" | "desc";

// `null` = unsorted (rows in arrival order from the manager). Clicking a
// column cycles asc → desc → unsorted → asc, so users can clear a sort
// without picking a different column.
const sortBy = ref<SortField | null>("ip");
const sortDir = ref<SortDir>("asc");

const toggleSort = (field: SortField) => {
  if (sortBy.value === field) {
    if (sortDir.value === "asc") {
      sortDir.value = "desc";
    } else {
      sortBy.value = null;
    }
  } else {
    sortBy.value = field;
    sortDir.value = "asc";
  }
};

// Zero-pad each IPv4 octet so a lexicographic compare sorts numerically.
// IPv6 falls through as-is (expanding `::` for proper ordering is a v2
// concern; in practice CIFS/NFS clients on a LAN are overwhelmingly v4).
const ipSortKey = (ip: string): string => {
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return ip;
  return m.slice(1).map((s) => s.padStart(3, "0")).join(".");
};

const sortValue = (c: ConnectedClient, f: SortField): string | number => {
  switch (f) {
    case "protocol":
      return c.protocol;
    case "user":
      return c.user ?? "";
    case "ip":
      return ipSortKey(c.ip);
    case "protocolVersion":
      return c.protocolVersion;
    case "share":
      return c.share ?? "";
    case "connectedSince":
      return c.connectedSince ? c.connectedSince.getTime() : 0;
    case "openFiles":
      return c.openFiles;
    case "encrypted":
      return c.encrypted ? 1 : 0;
  }
};

const sortedClients = computed(() => {
  const f = sortBy.value;
  if (f === null) return filteredClients.value;
  const arr = [...filteredClients.value];
  const dir = sortDir.value === "asc" ? 1 : -1;
  return arr.sort((a, b) => {
    const av = sortValue(a, f);
    const bv = sortValue(b, f);
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
});

const filterOptions = computed<SelectMenuOption<Filter>[]>(() => {
  const sambaCount = clients.value.filter((c) => c.protocol === "samba").length;
  const nfsCount = clients.value.filter((c) => c.protocol === "nfs").length;
  const total = clients.value.length;
  return [
    { label: `${_("All")} (${total})`, value: "all" },
    { label: `${_("Samba")} (${sambaCount})`, value: "samba" },
    { label: `${_("NFS")} (${nfsCount})`, value: "nfs" },
  ];
});

const refreshIntervalSeconds = computed(
  () => userSettings.value.connectedClients.refreshIntervalSeconds
);

// `inFlight` gates concurrent fetches AND drives the spinner animation on
// the refresh icon. Two reasons for the single source of truth:
//  1) Skip-overlap: if a poll is still running when the next tick (or a
//     manual click) fires, the new one no-ops. Cancelling + restarting
//     hung calls (DNS timeout, slow nmblookup) just produces a fresh
//     hang — and Cockpit lacks first-class cancellation primitives.
//  2) Min-spin duration: local fetches usually finish in <100ms, so the
//     animate-spin barely registers visually. Holding inFlight true for
//     at least MIN_SPIN_MS lets the user perceive each refresh tick.
const inFlight = ref(false);
const MIN_SPIN_MS = 400;
let spinStartedAt = 0;
const beginInFlight = () => {
  inFlight.value = true;
  spinStartedAt = performance.now();
};
const releaseInFlight = () => {
  const remaining = MIN_SPIN_MS - (performance.now() - spinStartedAt);
  if (remaining <= 0) {
    inFlight.value = false;
  } else {
    window.setTimeout(() => {
      inFlight.value = false;
    }, remaining);
  }
};

// Background poll: silence errors so a chronic failure doesn't spam
// notifications every tick. ResultAsync is PromiseLike, not Promise, so
// we use .then(success, error) instead of .finally for cleanup.
const pollTick = () => {
  if (inFlight.value) return;
  beginInFlight();
  reloadClients()
    .mapErr(() => undefined)
    .then(releaseInFlight, releaseInFlight);
};

// Manual refresh: surfaces errors via wrapActions's notification handler.
// If a poll is already in flight, return an immediately-resolved ok so
// the click silently no-ops.
const refreshNow = () => {
  if (inFlight.value) return okAsync(undefined as void);
  beginInFlight();
  const r = reloadClients();
  r.then(releaseInFlight, releaseInFlight);
  return r;
};

let refreshTimer: number | undefined;
const startTimer = () => {
  if (refreshTimer !== undefined) window.clearInterval(refreshTimer);
  const ms = Math.max(1, refreshIntervalSeconds.value) * 1000;
  refreshTimer = window.setInterval(pollTick, ms);
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
  refreshNow,
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
              @click="actions.refreshNow()"
              :title="_('Refresh now')"
            >
              <ArrowPathIcon
                class="size-icon icon-default"
                :class="{ 'animate-spin': inFlight }"
              />
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
                <th scope="col">
                  <button type="button" class="inline-flex items-center gap-1" @click="toggleSort('protocol')">
                    {{ _("Protocol") }}
                    <ChevronUpIcon v-if="sortBy === 'protocol' && sortDir === 'asc'" class="size-4" />
                    <ChevronDownIcon v-else-if="sortBy === 'protocol' && sortDir === 'desc'" class="size-4" />
                  </button>
                </th>
                <th scope="col">
                  <button type="button" class="inline-flex items-center gap-1" @click="toggleSort('user')">
                    {{ _("User") }}
                    <ChevronUpIcon v-if="sortBy === 'user' && sortDir === 'asc'" class="size-4" />
                    <ChevronDownIcon v-else-if="sortBy === 'user' && sortDir === 'desc'" class="size-4" />
                  </button>
                </th>
                <th scope="col">
                  <button type="button" class="inline-flex items-center gap-1" @click="toggleSort('ip')">
                    {{ _("Client") }}
                    <ChevronUpIcon v-if="sortBy === 'ip' && sortDir === 'asc'" class="size-4" />
                    <ChevronDownIcon v-else-if="sortBy === 'ip' && sortDir === 'desc'" class="size-4" />
                  </button>
                </th>
                <th scope="col">
                  <button type="button" class="inline-flex items-center gap-1" @click="toggleSort('protocolVersion')">
                    {{ _("Version") }}
                    <ChevronUpIcon v-if="sortBy === 'protocolVersion' && sortDir === 'asc'" class="size-4" />
                    <ChevronDownIcon v-else-if="sortBy === 'protocolVersion' && sortDir === 'desc'" class="size-4" />
                  </button>
                </th>
                <th scope="col">
                  <button type="button" class="inline-flex items-center gap-1" @click="toggleSort('share')">
                    {{ _("Share") }}
                    <ChevronUpIcon v-if="sortBy === 'share' && sortDir === 'asc'" class="size-4" />
                    <ChevronDownIcon v-else-if="sortBy === 'share' && sortDir === 'desc'" class="size-4" />
                  </button>
                </th>
                <th scope="col">
                  <button type="button" class="inline-flex items-center gap-1" @click="toggleSort('connectedSince')">
                    {{ _("Connected since") }}
                    <ChevronUpIcon v-if="sortBy === 'connectedSince' && sortDir === 'asc'" class="size-4" />
                    <ChevronDownIcon v-else-if="sortBy === 'connectedSince' && sortDir === 'desc'" class="size-4" />
                  </button>
                </th>
                <th scope="col">
                  <button type="button" class="inline-flex items-center gap-1" @click="toggleSort('openFiles')">
                    {{ _("Open files") }}
                    <ChevronUpIcon v-if="sortBy === 'openFiles' && sortDir === 'asc'" class="size-4" />
                    <ChevronDownIcon v-else-if="sortBy === 'openFiles' && sortDir === 'desc'" class="size-4" />
                  </button>
                </th>
                <th scope="col">
                  <button type="button" class="inline-flex items-center gap-1" @click="toggleSort('encrypted')">
                    {{ _("Encrypted") }}
                    <ChevronUpIcon v-if="sortBy === 'encrypted' && sortDir === 'asc'" class="size-4" />
                    <ChevronDownIcon v-else-if="sortBy === 'encrypted' && sortDir === 'desc'" class="size-4" />
                  </button>
                </th>
                <th scope="col" class="justify-end"><span class="sr-only">Actions</span></th>
              </tr>
            </template>
            <template #tbody>
              <tr v-for="client in sortedClients" :key="client.id">
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
