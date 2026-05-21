<script setup lang="ts">
import {
  CardContainer,
  SelectMenu,
  Table,
  type SelectMenuOption,
} from "@45drives/houston-common-ui";
import {
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@heroicons/vue/20/solid";
import { computed, ref } from "vue";

import type {
  ClientProtocol,
  ConnectedClient,
} from "@/tabs/connected-clients/data-types";

const _ = cockpit.gettext;

const props = defineProps<{
  clients: ConnectedClient[];
  inFlight: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
  kick: [client: ConnectedClient];
}>();

type Filter = "all" | ClientProtocol;
const filter = ref<Filter>("all");

const filteredClients = computed(() =>
  filter.value === "all"
    ? props.clients
    : props.clients.filter((c) => c.protocol === filter.value)
);

const filterOptions = computed<SelectMenuOption<Filter>[]>(() => {
  const sambaCount = props.clients.filter((c) => c.protocol === "samba").length;
  const nfsCount = props.clients.filter((c) => c.protocol === "nfs").length;
  const total = props.clients.length;
  return [
    { label: `${_("All")} (${total})`, value: "all" },
    { label: `${_("Samba")} (${sambaCount})`, value: "samba" },
    { label: `${_("NFS")} (${nfsCount})`, value: "nfs" },
  ];
});

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

const formatDate = (d: Date | null): string => (d ? d.toLocaleString() : "—");
const fallback = (v: string | null | undefined): string =>
  v && v.length > 0 ? v : "—";

// NFS Share is derived from active opens because the kernel doesn't expose a
// per-client mount list for NFSv4 (no tcon concept). Surface that caveat as
// a hover tooltip so operators don't read a blank cell as "not mounted".
const shareTooltip = (c: ConnectedClient): string | undefined => {
  if (c.protocol !== "nfs") return undefined;
  return _(
    'NFS: derived from active opens (the kernel doesn\'t expose a per-client mount list for NFSv4). An idle-but-mounted client will show "—" here even when connected; the column reflects what is currently being read/written, not what is mounted.'
  );
};

// Column definitions for the sortable header row. Labels are wrapped in _()
// at module init time, matching the convention used elsewhere in this project
// (e.g. tabVisibilityOptions in UserSettingsView.vue).
const sortableColumns: { field: SortField; label: string }[] = [
  { field: "protocol", label: _("Protocol") },
  { field: "user", label: _("User") },
  { field: "ip", label: _("Client") },
  { field: "protocolVersion", label: _("Version") },
  { field: "share", label: _("Share") },
  { field: "connectedSince", label: _("Connected since") },
  { field: "openFiles", label: _("Open files") },
  { field: "encrypted", label: _("Encrypted") },
];
</script>

<template>
  <CardContainer>
    <template #header>
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <span>{{ _("Connected Clients") }}</span>
        <div class="flex items-center gap-2">
          <SelectMenu v-model="filter" :options="filterOptions" />
          <button
            class="btn btn-secondary inline-flex flex-row items-center gap-1 text-base font-normal"
            @click="emit('refresh')"
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
              <th v-for="col in sortableColumns" :key="col.field" scope="col">
                <button
                  type="button"
                  class="inline-flex items-center gap-1"
                  @click="toggleSort(col.field)"
                >
                  {{ col.label }}
                  <ChevronUpIcon
                    v-if="sortBy === col.field && sortDir === 'asc'"
                    class="size-4"
                  />
                  <ChevronDownIcon
                    v-else-if="sortBy === col.field && sortDir === 'desc'"
                    class="size-4"
                  />
                </button>
              </th>
              <th scope="col" class="justify-end"><span class="sr-only">{{ _("Actions") }}</span></th>
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
              <td :title="shareTooltip(client)">
                {{ fallback(client.share) }}
              </td>
              <td>{{ formatDate(client.connectedSince) }}</td>
              <td>{{ client.openFiles }}</td>
              <td>{{ client.encrypted ? _("Yes") : _("No") }}</td>
              <td class="button-group-row justify-end">
                <button
                  v-if="client.protocol === 'samba'"
                  class="btn btn-secondary btn-sm"
                  @click="emit('kick', client)"
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
</template>
