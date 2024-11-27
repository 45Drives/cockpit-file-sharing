<script setup lang="ts">
import { ref, computed, defineProps, nextTick } from "vue";
import type { SambaShareConfig } from "@/tabs/samba/data-types";
import {
  CardContainer,
  Disclosure,
  DisclosureController,
  Table,
} from "@45drives/houston-common-ui";
import { PlusIcon } from "@heroicons/vue/20/solid";
import ShareEditor from "@/tabs/samba/ui/ShareEditor.vue";
import { PencilSquareIcon, TrashIcon } from "@heroicons/vue/20/solid";

const _ = cockpit.gettext;

const props = defineProps<{
  shares: SambaShareConfig[];
}>();

const emit = defineEmits<{
  (e: "addShare", share: SambaShareConfig, callback?: () => void): void;
  (e: "editShare", share: SambaShareConfig, callback?: () => void): void;
  (e: "removeShare", share: SambaShareConfig, callback?: () => void): void;
}>();

const showNewShareEditor = ref(false);

const shareNames = computed(() => props.shares.map((s) => s.name));
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
        @apply="(s) => emit('addShare', s, () => (showNewShareEditor = false))"
        class="!shadow-none !divide-y-0 pb-5 pt-5 px-4 sm:!pt-0 sm:!px-0"
      />
    </Disclosure>

    <Table
      :emptyText="_('No shares. Click \'+\' to add one.')"
      noScroll
      class="sm:rounded-lg sm:shadow sm:border sm:border-default sm:overflow-hidden"
    >
      <template #thead>
        <tr>
          <th scope="col">{{ _("Name") }}</th>
          <th scope="col">{{ _("Path") }}</th>
          <th scope="col">{{ _("Description") }}</th>
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
          <DisclosureController v-slot="{ show: showEditor, setShow: setShowEditor }">
            <tr>
              <td>{{ share.name }}</td>
              <td
                class="text-muted text-ellipsis overflow-hidden w-1/4 max-w-0"
                :title="share.path"
              >
                {{ share.path }}
              </td>
              <td
                class="text-muted text-ellipsis overflow-hidden w-3/4 max-w-0"
                :title="share.description"
              >
                {{ share.description }}
              </td>
              <td class="button-group-row justify-end">
                <button @click="setShowEditor(!showEditor)">
                  <span class="sr-only">Edit</span>
                  <PencilSquareIcon class="size-icon icon-default" />
                </button>
                <button
                  @click="
                    // for fileystem-specific hooks:
                    setShowEditor(true);
                    nextTick(() => emit('removeShare', share));
                  "
                >
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
                      @apply="(share) => emit('editShare', share, () => setShowEditor(false))"
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
