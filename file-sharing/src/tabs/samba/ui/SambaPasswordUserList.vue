<template>
  <div @keypress="onKeyPress" tabindex="0">
    <Table sticky-headers class="md:shadow-lg shadow-md">
      <template #header>
        <div class="flex flex-row justify-between items-baseline">
          <div>Samba Password Manager</div>
          <div class="button-group-row">
            <slot name="close-button"></slot>
          </div>
        </div>
      </template>
      <template #thead>
        <tr>
          <th
            class="flex flex-row justify-between items-center cursor-pointer gap-2"
            @click="() => changeSort(sortByLogin)"
          >
            <span>User</span>
            <div v-if="sortCmp !== sortByLogin" class="size-icon icon-default w-5"></div>
            <ChevronDownIcon v-else-if="descending" class="size-icon icon-default w-5" />
            <ChevronUpIcon v-else class="size-icon icon-default w-5" />
          </th>
          <th>Name</th>
          <th
            class="flex flex-row justify-between items-center cursor-pointer gap-2"
            @click="() => changeSort(sortByUID)"
          >
            <span>UID</span>
            <div v-if="sortCmp !== sortByUID" class="size-icon icon-default w-5"></div>
            <ChevronDownIcon v-else-if="descending" class="size-icon icon-default w-5" />
            <ChevronUpIcon v-else class="size-icon icon-default w-5" />
          </th>
          <th>Actions</th>
        </tr>
      </template>
      <template #tbody>
        <tr v-for="user in usersSorted">
          <td>
            {{ user.login }}
          </td>
          <td>
            {{ user.name }}
          </td>
          <td>
            {{ user.uid }}
          </td>
          <td ref="focusRefs">
            <SambaPasswordButtons :user="user" @keypress.capture.stop="" />
          </td>
        </tr>
      </template>
    </Table>
  </div>
</template>

<script setup lang="ts">
import { Server, type LocalUser } from "@45drives/houston-common-lib";
import { Table } from "@45drives/houston-common-ui";
import { computed, ref, watch, inject } from "vue";
import SambaPasswordButtons from "@/tabs/samba/ui/SambaPasswordButtons.vue";
import { useUserSettings } from "@/common/user-settings";
import { ChevronUpIcon, ChevronDownIcon } from "@heroicons/vue/20/solid";

import { sambaManagerInjectionKey } from "@/tabs/samba/ui/injectionKeys";

const settings = useUserSettings();

const server = ref<Server>();
inject(sambaManagerInjectionKey)?.map((s) => (server.value = s.getServer()));

const includeSystemUsers = computed(() => settings.value.includeSystemAccounts);

const allUsers = ref<LocalUser[]>([]);

watch(
  server,
  (server) => {
    server?.getLocalUsers().map((users) => (allUsers.value = users));
  },
  { immediate: true }
);

const users = computed(() => {
  const NOBODY_UID = 65534;
  const ROOT_UID = 0;
  return includeSystemUsers.value
    ? [...allUsers.value]
    : allUsers.value.filter((u) => u.uid >= 1000 || [ROOT_UID, NOBODY_UID].includes(u.uid));
});

const descending = ref(false);

type SortCmp = (a: LocalUser, b: LocalUser) => number;

const sortByLogin: SortCmp = (a, b) => a.login.localeCompare(b.login);
const sortByUID: SortCmp = (a, b) => a.uid - b.uid;

const sortCmp = ref<SortCmp>(sortByLogin);

const usersSorted = computed(() => {
  const sorted = [...users.value].sort(sortCmp.value);
  return descending.value ? sorted.reverse() : sorted;
});

const changeSort = (cmpFn: SortCmp) => {
  if (sortCmp.value !== cmpFn) {
    sortCmp.value = cmpFn;
  } else {
    descending.value = !descending.value;
  }
};

const focusRefs = ref<HTMLElement[]>([]);

let keybuffer = "";
let keyTimeout: number;
function onKeyPress(e: KeyboardEvent) {
  if (!e.key) {
    return;
  }
  window.clearTimeout(keyTimeout);
  keyTimeout = window.setTimeout(() => (keybuffer = ""), 1000);
  keybuffer += e.key;

  if (!keybuffer) {
    return;
  }

  const focusIndex = usersSorted.value.findIndex((u) =>
    u.login.toLowerCase().startsWith(keybuffer.toLowerCase())
  );
  if (focusIndex === -1) {
    return;
  }
  focusRefs.value[focusIndex]?.scrollIntoView({ behavior: "smooth", block: "center" });
}
</script>
