<script setup lang="ts">
import { ref, onMounted, computed, defineProps, inject } from "vue";
import type { SambaShareConfig } from "@/tabs/samba/data-types";
import {
  CardContainer,
  Disclosure,
  DisclosureController,
  SelectMenu,
  useTempObjectStaging,
  wrapActions,
  reportSuccess,
  assertConfirm,
  type SelectMenuOption,
} from "@45drives/houston-common-ui";
import { getServer } from "@45drives/houston-common-lib";
import { getSambaManager } from "@/tabs/samba/samba-manager";
import Table from "@/tabs/samba/ui/Table.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import ShareEditor from "@/tabs/samba/ui/ShareEditor.vue";
import { okAsync, errAsync } from "neverthrow";
import { clusterScopeInjectionKey } from "@/common/injectionKeys";
import { PencilSquareIcon, TrashIcon } from "@heroicons/vue/20/solid";

const _ = cockpit.gettext;

const sambaManager = getServer().map((server) => getSambaManager(server));

const showNewShareEditor = ref(false);

const shares = ref<SambaShareConfig[]>([]);

const shareNames = computed(() => shares.value.map((s) => s.name));

const shareSortPredicate = (a: SambaShareConfig, b: SambaShareConfig) =>
  a.name.localeCompare(b.name, undefined, { caseFirst: "false" });

const loadShares = () =>
  sambaManager
    .andThen((sm) => sm.getShares())
    .map((s) => {
      s.sort(shareSortPredicate);
      shares.value = s;
    });

const reloadShare = (shareName: string) =>
  sambaManager
    .andThen((sm) => sm.getShare(shareName))
    .map((newShare) => {
      // if share is in array
      if (shares.value.some((s) => s.name === newShare.name)) {
        // patch new share config into array
        shares.value = shares.value.map((oldShare) =>
          oldShare.name === newShare.name ? newShare : oldShare
        );
      } else {
        // append share to array
        shares.value = [newShare, ...shares.value].sort(shareSortPredicate);
      }
    });

const addShare = (share: SambaShareConfig) =>
  sambaManager
    .andThen((sm) => sm.addShare(share))
    .andThen(() => reloadShare(share.name))
    .map(() => reportSuccess(`${_("Successfully added share")} ${share.name}`));

const editShare = (share: SambaShareConfig) =>
  sambaManager
    .andThen((sm) => sm.editShare(share))
    .andThen(() => reloadShare(share.name))
    .map(() => reportSuccess(`${_("Successfully updated share")} ${share.name}`));

const removeShare = (share: SambaShareConfig) =>
  assertConfirm({
    header: _("Permanently delete") + ` ${share.name}?`,
    body: _("This cannot be undone."),
    dangerous: true,
  })
    .andThen(() => sambaManager)
    .andThen((sm) => sm.removeShare(share))
    .map(() => (shares.value = shares.value.filter((s) => s.name !== share.name)))
    .map(() => reportSuccess(`${_("Successfully removed share")} ${share.name}`));

const actions = wrapActions({
  loadShares,
  addShare,
  editShare,
  removeShare,
});

onMounted(actions.loadShares);
</script>

<template>
  <CardContainer noBodyPaddingOnMobile>
    <template v-slot:header>
      {{ _("Share Configuration") }}
    </template>

    <Disclosure noButton v-model:show="showNewShareEditor" v-slot="{ visible }">
      <ShareEditor
        v-if="visible"
        newShare
        :allShareNames="shareNames"
        @cancel="showNewShareEditor = false"
        @apply="
          (s) =>
            actions.addShare(s).map(() => {
              showNewShareEditor = false;
            })
        "
        class="!shadow-none !divide-y-0 pb-5 pt-5 px-4 sm:!pt-0 sm:!px-0"
      />
    </Disclosure>

    <Table
      :emptyText="_('No shares. Click \'+\' to add one.')"
      noScroll
      class="sm:rounded-lg sm:shadow sm:border sm:border-default"
    >
      <template #thead>
        <tr>
          <th scope="col">{{ _("Name") }}</th>
          <th scope="col">{{ _("Path") }}</th>
          <th scope="col" class="flex flex-row justify-end">
            <span class="sr-only">{{ _("Edit/Delete") }}</span>
            <button @click="showNewShareEditor = !showNewShareEditor">
              <span class="sr-only">{{ _("Add new share") }}</span>
              <PlusIcon class="size-icon icon-default" />
            </button>
          </th>
        </tr>
      </template>
      <template #tbody>
        <template v-for="share in shares" :key="share.name">
          <!-- <ShareTableRow
            :share="share"
            :allShareNames="shareNames"
            @editShare="(s, callback) => actions.editShare(s).map(() => callback())"
            @removeShare="(s) => actions.removeShare(s)"
          /> -->
          <DisclosureController v-slot="{ show: showEditor, setShow: setShowEditor }">
            <tr>
              <td>{{ share.name }}</td>
              <td class="text-muted">{{ share.path }}</td>
              <td class="button-group-row justify-end">
                <button @click="setShowEditor(!showEditor)">
                  <span class="sr-only">Edit</span>
                  <PencilSquareIcon class="size-icon icon-default" />
                </button>
                <button @click="actions.removeShare(share)">
                  <span class="sr-only">Delete</span>
                  <TrashIcon class="size-icon icon-danger" />
                </button>
              </td>
            </tr>
            <tr></tr>
            <!-- needed to match bg color -->
            <tr>
              <td colspan="100%" class="!p-0">
                <div class="whitespace-normal">
                  <Disclosure noButton :show="showEditor" v-slot="{ visible }">
                    <ShareEditor
                      v-if="visible"
                      :share="share"
                      :allShareNames="shareNames"
                      class="!shadow-none px-4 sm:px-6 py-5"
                      @cancel="setShowEditor(false)"
                      @apply="(share) => actions.editShare(share).map(() => setShowEditor(false))"
                    />
                  </Disclosure>
                </div>
              </td>
            </tr>
          </DisclosureController>
        </template>
      </template>
    </Table>
  </CardContainer>
</template>
