<script setup lang="ts">
import {
  newNFSExport,
  type NFSExport,
  newNFSExportClient,
  type NFSExportClient,
} from "@/tabs/nfs/data-types";
import {
  useGlobalProcessingState,
  useTempObjectStaging,
  InputField,
  InputLabelWrapper,
  computedResult,
  ValidationScope,
  validationSuccess,
  validationError,
  ValidationResultView,
  Table,
  type ValidationResult,
} from "@45drives/houston-common-ui";
import { defineProps, defineEmits, computed, ref } from "vue";
import ShareDirectoryInputAndOptions from "@/common/ui/ShareDirectoryInputAndOptions.vue";
import { PlusIcon, TrashIcon } from "@heroicons/vue/20/solid";
import { getServer, FileSystemNode } from "@45drives/houston-common-lib";

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

const resolvePath = () => {
  const path = tempExportConfig.value.path;
  getServer()
    .map((s) => new FileSystemNode(s, path))
    .andThen((node) => node.resolve(false, { superuser: "try" }))
    .map((node) => (tempExportConfig.value.path = node.path));
};

const validationScope = new ValidationScope();
const { validationResult: pathValidationResult } = validationScope.useValidator(() => {
  if (!props.newExport) {
    return validationSuccess();
  }
  if (props.allExportedPaths.includes(tempExportConfig.value.path)) {
    return validationError(_("Path already exported") + `: ${tempExportConfig.value.path}`);
  }
  return validationSuccess();
});

const { validationResult: commentValidationResult } = validationScope.useValidator(() => {
  if (tempExportConfig.value.comment.endsWith("\\")) {
    return validationError(_("Comment cannot end with '\\'."));
  }
  return validationSuccess();
});

const allowedClientSettings = {
  boolOpts: [
    "secure",
    "insecure",
    "rw",
    "ro",
    "async",
    "sync",
    "no_wdelay",
    "wdelay",
    "nohide",
    "hide",
    "crossmnt",
    "no_subtree_check",
    "subtree_check",
    "insecure_locks",
    "no_auth_nlm",
    "auth_nlm",
    "secure_locks",
    "no_acl",
    "mountpoint",
    "mp",
    "root_squash",
    "no_root_squash",
    "all_squash",
    "no_all_squash",
  ],
  argumentOpts: ["mountpoint", "mp", "fsid", "refer", "replicas", "anonuid", "anongid"],
};

const clientOptionsValidator = (optionList: string): ValidationResult => {
  if (!optionList) {
    return validationSuccess();
  }
  if (/\s/.test(optionList)) {
    return validationError(_("Whitespace not permitted."));
  }
  const badOpts = optionList.split(",").filter((opt) => {
    if (allowedClientSettings.boolOpts.includes(opt)) {
      return false;
    }
    for (const allowedArgumentOpt of allowedClientSettings.argumentOpts) {
      if (opt.startsWith(`${allowedArgumentOpt}=`)) {
        return false;
      }
    }
    return true;
  });
  if (badOpts.length) {
    return validationError(_("Bad options") + ": " + badOpts.map((opt) => `"${opt}"`).join(", "));
  }
  return validationSuccess();
};

const { validationResult: defaultClientSettingsValidationResult } = validationScope.useValidator(
  () => clientOptionsValidator(tempExportConfig.value.defaultClientSettings)
);

const clientValidator = (client: NFSExportClient): ValidationResult => {
  if (!client.host) {
    return validationError(_("Host required."));
  }
  if (/\s/.test(client.host)) {
    return validationError(_("Whitespace not permitted."));
  }
  return clientOptionsValidator(client.settings);
};

const { validationResult: clientSettingsValidationResult } = validationScope.useValidator(() => {
  const clients = tempExportConfig.value.clients;
  for (const [index, client] of clients.entries()) {
    if (clients.findIndex(({ host }) => host === client.host) !== index) {
      return validationError(_("Duplicate client") + `: ${client.host}`);
    }
  }
  const badClientResults = clients
    .map((client, index) => ({
      index,
      client,
      result: clientValidator(client),
    }))
    .filter(({ result }) => result.type === "error");
  if (badClientResults.length) {
    return validationError(
      badClientResults
        .map(({ index, client, result }) => `${client.host || index}: ${result.message}`)
        .join("\n")
    );
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
          :validationScope
          @change="() => resolvePath()"
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
        <ValidationResultView v-bind="commentValidationResult" />
      </InputLabelWrapper>

      <InputLabelWrapper tooltipAbove>
        <template #label>
          {{ _("Default Client Settings") }}
        </template>
        <template #tooltip>
          {{ _("Settings to apply to all clients") }}
        </template>
        <InputField v-model="tempExportConfig.defaultClientSettings" />
        <ValidationResultView v-bind="defaultClientSettingsValidationResult" />
      </InputLabelWrapper>

      <InputLabelWrapper tooltipAbove>
        <template #label>
          {{ _("Clients") }}
        </template>
        <template #tooltip>
          {{ clientsTooltip }}
        </template>
        <Table
          :emptyText="_('No shares. Click \'+\' to add one.')"
          noScroll
          class="rounded-lg shadow border border-default overflow-hidden"
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
                <td class="overflow-hidden w-1/4 max-w-0">
                  <InputField :placeholder="_('Default: *')" v-model="client.host" />
                </td>
                <td class="overflow-hidden w-3/4 max-w-0">
                  <InputField
                    :placeholder="_('Default: rw,sync,no_subtree_check')"
                    v-model="client.settings"
                  />
                </td>
                <td>
                  <div class="button-group-row justify-end">
                    <button
                      :disabled="tempExportConfig.clients.length <= 1"
                      :title="_('Remove client')"
                      @click="() => removeClient(index)"
                    >
                      <span class="sr-only">Delete</span>
                      <TrashIcon class="size-icon icon-danger" />
                    </button>
                  </div>
                </td>
              </tr>
            </template>
          </template>
        </Table>
        <ValidationResultView v-bind="clientSettingsValidationResult" />
      </InputLabelWrapper>

      <InputLabelWrapper>
        <template #label>
          {{ _("Export Preview") }}
        </template>
        <div class="font-mono whitespace-pre-wrap">
          {{ validationScope.isValid() ? exportPreview : "" }}
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
          :disabled="!validationScope.isValid() || !modified || globalProcessingState !== 0"
        >
          {{ _("Apply") }}
        </button>
      </div>
    </div>
  </div>
</template>
