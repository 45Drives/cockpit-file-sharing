<script setup lang="ts">
import { newNFSExport, type NFSExport, newNFSExportClient } from "@/tabs/nfs/data-types";
import {
  useGlobalProcessingState,
  useTempObjectStaging,
  InputField,
  InputLabelWrapper,
  computedResult,
  useValidationScope,
  useValidator,
  validationSuccess,
  validationError,
  ValidationResultView,
} from "@45drives/houston-common-ui";
import { defineProps, defineEmits, computed, ref } from "vue";
import ShareDirectoryInputAndOptions from "@/common/ui/ShareDirectoryInputAndOptions.vue";
import Table from "@/common/ui/Table.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";

import { NFSExportParser } from "@/tabs/nfs/exports-parser";

const _ = cockpit.gettext;

const props = defineProps<
  (
    | {
        newExport?: false;
        nfsExport: NFSExport;
      }
    | {
        newExport: true;
      }
  ) & {
    allExportedPaths: string[];
  }
>();

const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "apply", value: NFSExport): void;
}>();

const globalProcessingState = useGlobalProcessingState();

const exportConfig = computed<NFSExport>(() =>
  props.newExport ? newNFSExport() : props.nfsExport
);

const { tempObject: tempExportConfig, modified, resetChanges } = useTempObjectStaging(exportConfig);

const addClient = () => {
  tempExportConfig.value.clients = [...tempExportConfig.value.clients, newNFSExportClient()];
};

const removeClient = (index: number) => {
  tempExportConfig.value.clients = tempExportConfig.value.clients.filter((_, i) => i !== index);
};

const clientsTooltip = _(
  `Host - one of:
  - single host (hostname, fully qualified domain name, IPv4, IPv6)
  - NIS netgroup (@group)
  - wildcard (glob style hostname e.g. *.local, pc[0123].local, jd?e.desktop)
  - IP network + mask (e.g. 10.0.0.0/22 or 192.168.0.0/255.255.252.0)

Settings:
  - Comma-separated list of export settings
  - See <a href="https://linux.die.net/man/5/exports">man exports(5)</a> for full list of settings
  - Recommended client defaults: rw,sync,no_subtree_check`
);

const parser = new NFSExportParser();

const [exportPreview] = computedResult(() => parser.unapply(tempExportConfig.value), "");

const { scopeValid } = useValidationScope();
const { validationResult: pathValidationResult } = useValidator(() => {
  if (!props.newExport) {
    return validationSuccess();
  }
  if (props.allExportedPaths.includes(tempExportConfig.value.path)) {
    return validationError(_("Path already exported") + `: ${tempExportConfig.value.path}`);
  }
  return validationSuccess();
});
</script>

<template>
  <div class="space-y-content">
    <div v-if="newExport" class="text-header">{{ _("New Share") }}</div>
    <div class="space-y-content">
      <div>
        <ShareDirectoryInputAndOptions
          v-model:path="tempExportConfig.path"
          :disabled="!newExport"
          ref="pathChecker"
        />
        <ValidationResultView v-bind="pathValidationResult" />
      </div>

      <InputLabelWrapper>
        <template #label>
          {{ _("Share Comment") }}
        </template>
        <InputField
          v-model="tempExportConfig.comment"
          :placeholder="_('A description for your share')"
        />
      </InputLabelWrapper>

      <InputLabelWrapper>
        <template #label>
          {{ _("Default Client Settings") }}
        </template>
        <template #tooltip>
          {{ _("Settings to apply to all clients") }}
        </template>
        <InputField v-model="tempExportConfig.defaultClientSettings" />
      </InputLabelWrapper>

      <InputLabelWrapper>
        <template #label>
          {{ _("Clients") }}
        </template>
        <template #tooltip>
          {{ clientsTooltip }}
        </template>
        <Table
          :emptyText="_('No shares. Click \'+\' to add one.')"
          noScroll
          class="sm:rounded-lg sm:shadow sm:border sm:border-default"
        >
          <template #thead>
            <tr>
              <th scope="col">{{ _("Host") }}</th>
              <th scope="col">{{ _("Settings") }}</th>
              <th scope="col" class="flex flex-row justify-end">
                <span class="sr-only">{{ _("Delete") }}</span>
                <button @click="() => addClient()">
                  <span class="sr-only">{{ _("Add new client") }}</span>
                  <PlusIcon class="size-icon icon-default" />
                </button>
              </th>
            </tr>
          </template>
          <template #tbody>
            <template v-for="(client, index) in tempExportConfig.clients" :key="index">
              <tr>
                <td>
                  <InputField :placeholder="_('Default: *')" v-model="client.host" />
                </td>
                <td>
                  <InputField
                    :placeholder="_('Default: rw,sync,no_subtree_check')"
                    v-model="client.settings"
                  />
                </td>
                <td class="button-group-row justify-end">
                  <button
                    :disabled="tempExportConfig.clients.length <= 1"
                    @click="() => removeClient(index)"
                  >
                    <span class="sr-only">Delete</span>
                    <TrashIcon class="size-icon icon-danger" />
                  </button>
                </td>
              </tr>
            </template>
          </template>
        </Table>
      </InputLabelWrapper>

      <InputLabelWrapper>
        <template #label>
          {{ _("Export Preview") }}
        </template>
        <div class="font-mono whitespace-pre">
          {{ scopeValid ? exportPreview : "" }}
        </div>
      </InputLabelWrapper>

      <div class="button-group-row justify-end grow">
        <button
          class="btn btn-secondary"
          @click="
            () => {
              resetChanges();
              $emit('cancel');
            }
          "
        >
          {{ _("Cancel") }}
        </button>
        <button
          class="btn btn-primary"
          @click="$emit('apply', tempExportConfig)"
          :disabled="!scopeValid || !modified || globalProcessingState !== 0"
        >
          {{ _("Apply") }}
        </button>
      </div>
    </div>
  </div>
</template>
