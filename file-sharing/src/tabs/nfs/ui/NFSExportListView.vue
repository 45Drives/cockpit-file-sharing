<script setup lang="ts">
import { ref, computed, defineProps, inject, nextTick, watch } from "vue";
import type { NFSExport } from "@/tabs/nfs/data-types";
import {
  CardContainer,
  Disclosure,
  DisclosureController,
  Table,
} from "@45drives/houston-common-ui";
import NFSExportEditor from "@/tabs/nfs/ui/NFSExportEditor.vue";
import { PencilSquareIcon, EyeIcon, TrashIcon, PlusIcon } from "@heroicons/vue/20/solid";
import { readOnlyInjectionKey } from "@/common/injectionKeys";

const _ = cockpit.gettext;

const props = defineProps<{
  nfsExports: NFSExport[];
}>();

const emit = defineEmits<{
  (e: "addExport", nfsExport: NFSExport, callback?: () => void): void;
  (e: "editExport", nfsExport: NFSExport, callback?: () => void): void;
  (e: "removeExport", nfsExport: NFSExport, callback?: () => void): void;
}>();

// Default ref(false) handles standalone test mounts that aren't under a provider.
const readOnly = inject(readOnlyInjectionKey, computed(() => false));

const showNewExportEditor = ref(false);

// Auto-close any open "new share" form when read-only is toggled on, so the
// editor doesn't get orphaned (the `+` button is hidden, leaving no obvious
// way to close it otherwise). Per-row editors don't need this — their inputs
// just become disabled and the Apply button hides reactively.
watch(readOnly, (isReadOnly) => {
  if (isReadOnly) showNewExportEditor.value = false;
});

const allExportedPaths = computed(() => props.nfsExports.map(({ path }) => path));
</script>

<template>
  <CardContainer noBodyPaddingOnMobile>
    <template v-slot:header>
      {{ _("Share Configuration") }}
    </template>

    <Disclosure noButton v-model:show="showNewExportEditor" v-slot="{ visible }">
      <NFSExportEditor
        v-if="visible"
        newExport
        :allExportedPaths="allExportedPaths"
        @cancel="showNewExportEditor = false"
        @apply="(s) => emit('addExport', s, () => (showNewExportEditor = false))"
        class="!shadow-none !divide-y-0 pb-5 pt-5 px-4 sm:!pt-0 sm:!px-0"
      />
    </Disclosure>

    <Table
      :emptyText="readOnly ? _('No shares configured.') : _('No shares. Click \'+\' to add one.')"
      noScroll
      class="sm:rounded-lg sm:shadow sm:border sm:border-default sm:overflow-hidden"
    >
      <template #thead>
        <tr>
          <th scope="col">{{ _("Path") }}</th>
          <th scope="col">{{ _("Comment") }}</th>
          <th scope="col" class="flex flex-row justify-end">
            <span class="sr-only">{{ readOnly ? _("View") : _("Edit/Delete") }}</span>
            <button v-if="!readOnly" @click="showNewExportEditor = !showNewExportEditor">
              <span class="sr-only">{{ _("Add new share") }}</span>
              <PlusIcon class="size-icon icon-default" />
            </button>
          </th>
        </tr>
      </template>
      <template #tbody>
        <template v-for="nfsExport in nfsExports" :key="nfsExport.path">
          <DisclosureController v-slot="{ show: showEditor, setShow: setShowEditor }">
            <tr>
              <td class="text-ellipsis overflow-hidden w-1/4 max-w-0" :title="nfsExport.path">
                {{ nfsExport.path }}
              </td>
              <td
                class="text-muted text-ellipsis overflow-hidden w-3/4 max-w-0"
                :title="nfsExport.comment"
              >
                {{ nfsExport.comment }}
              </td>
              <td class="button-group-row justify-end">
                <button
                  @click="setShowEditor(!showEditor)"
                  :title="readOnly ? _('View details') : _('Edit')"
                >
                  <span class="sr-only">{{ readOnly ? _("View") : _("Edit") }}</span>
                  <EyeIcon v-if="readOnly" class="size-icon icon-default" />
                  <PencilSquareIcon v-else class="size-icon icon-default" />
                </button>
                <button
                  v-if="!readOnly"
                  @click="
                    // for fileystem-specific hooks:
                    setShowEditor(true);
                    nextTick(() => emit('removeExport', nfsExport));
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
                    <NFSExportEditor
                      v-if="visible"
                      :nfsExport="nfsExport"
                      :allExportedPaths="allExportedPaths"
                      class="!shadow-none px-4 sm:px-6 py-5"
                      @cancel="setShowEditor(false)"
                      @apply="
                        (nfsExport) => emit('editExport', nfsExport, () => setShowEditor(false))
                      "
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
