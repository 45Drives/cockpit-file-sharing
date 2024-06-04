<script setup lang="ts">
import { type SambaShareConfig, type SambaGlobalConfig } from "@/tabs/samba/data-types";
import { getServer, Download } from "@45drives/houston-common-lib";
import {
  CenteredCardColumn,
  Notification,
  pushNotification,
  wrapActions,
  CardContainer,
  FileUploadButton,
  assertConfirm,
  reportSuccess,
  computedResult,
  ToolTip,
} from "@45drives/houston-common-ui";

import GlobalConfigEditor from "./GlobalConfigEditor.vue";
import ShareListView from "@/tabs/samba/ui/ShareListView.vue";
import { getServerCluster } from "@/common/getServerCluster";

import { onMounted, provide, ref } from "vue";
import { serverClusterInjectionKey, cephClientNameInjectionKey } from "@/common/injectionKeys";

import { SambaManager } from "@/tabs/samba/samba-manager";

import { ResultAsync, ok, err } from "neverthrow";

const _ = cockpit.gettext;

provide(serverClusterInjectionKey, getServerCluster("ctdb"));
const cephClientName = ref<`client.${string}`>("client.samba");
provide(cephClientNameInjectionKey, cephClientName);

const server = getServer();

const sambaManager = server.map((server) => new SambaManager(server));

const defaultSmbConfPath = "/etc/samba/smb.conf";

const [globalConf, reloadGlobalConf] = computedResult(() =>
  sambaManager.andThen((sm) => sm.getGlobalConfig())
);

const [shares, reloadShares] = computedResult(
  () => sambaManager.andThen((sm) => sm.getShares()).map((s) => s.sort(shareSortPredicate)),
  []
);

const applyGlobalSettings = (newSettings: SambaGlobalConfig) =>
  sambaManager
    .andThen((sm) => sm.editGlobal(newSettings))
    .andThen(() => reloadGlobalConf())
    .map(() => reportSuccess(_("Updated global Samba configuration.")));

const shareSortPredicate = (a: SambaShareConfig, b: SambaShareConfig) =>
  a.name.localeCompare(b.name, undefined, { caseFirst: "false" });

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

const checkIfSmbConfIncludesRegistry = () =>
  sambaManager
    .andThen((sm) => sm.checkIfSmbConfIncludesRegistry(defaultSmbConfPath))
    .map((smbConfHasIncludeRegistry) => {
      if (!smbConfHasIncludeRegistry) {
        pushNotification(
          new Notification(
            _("Samba is Misconfigured"),
            _(
              "'include = registry' is missing from the global section of /etc/samba/smb.conf, which is required for File Sharing to manage shares."
            ),
            "error",
            "never"
          ).addAction(_("Fix now"), async () => {
            await actions.fixSmbConfIncludeRegistry();
          })
        );
      }
    });

const fixSmbConfIncludeRegistry = () =>
  sambaManager
    .andThen((sm) => sm.patchSmbConfIncludeRegistry(defaultSmbConfPath))
    .map(() => reportSuccess(_("Added `include = registry` to ") + defaultSmbConfPath));

const uploadRef = ref<InstanceType<typeof FileUploadButton> | null>(null);

const importConfig = () =>
  assertConfirm({
    header: _("Overwrite current configuration?"),
    body: _(
      "Any sections in uploaded file will overwrite current configuration sections. You should export a copy of your config first."
    ),
    dangerous: true,
  })
    .andThen(() => {
      if (uploadRef.value === null) {
        return err(new Error("uploadRef was null!"));
      }
      return uploadRef.value.getUpload();
    })
    .andThen(([file]) => (file === undefined ? err(new Error("No file given")) : ok(file)))
    .andThen((file) => ResultAsync.fromSafePromise(file.text()))
    .andThen((newConfigContents) =>
      sambaManager.andThen((sm) => sm.importConfig(newConfigContents))
    )
    .andThen(() => reloadGlobalConf())
    .andThen(() => reloadShares())
    .map(() => reportSuccess(_("Imported configuration")));

const exportConfig = () =>
  sambaManager
    .andThen((sm) => sm.exportConfig())
    .map((config) =>
      Download.content(
        [config],
        `cockpit-file-sharing_samba_exported_${new Date()
          .toISOString()
          .replace(/:/g, "-")
          .replace(/T/, "_")}.conf`
      )
    );

const importFromSmbConf = () =>
  assertConfirm({
    header: _("Overwrite current configuration?"),
    body: _(
      "Any sections in smb.conf will overwrite current configuration sections. You should export a copy of your config first."
    ),
    dangerous: true,
  })
    .andThen(() => sambaManager)
    .andThen((sm) => sm.importFromSmbConf(defaultSmbConfPath))
    .map(() => reportSuccess(_("Imported configuration")));

const actions = wrapActions({
  applyGlobalSettings,
  addShare,
  editShare,
  removeShare,
  checkIfSmbConfIncludesRegistry,
  fixSmbConfIncludeRegistry,
  importConfig,
  exportConfig,
  importFromSmbConf,
});

onMounted(actions.checkIfSmbConfIncludesRegistry);
</script>

<template>
  <CenteredCardColumn>
    <GlobalConfigEditor
      v-if="globalConf"
      :globalConf="globalConf"
      @apply="
        (newGlobalConf, callback) =>
          actions.applyGlobalSettings(newGlobalConf).map(() => callback?.())
      "
    />
    <ShareListView
      :shares="shares"
      @addShare="(newConf, callback) => actions.addShare(newConf).map(() => callback?.())"
      @editShare="(newConf, callback) => actions.editShare(newConf).map(() => callback?.())"
      @removeShare="(share, callback) => actions.removeShare(share).map(() => callback?.())"
    />
    <CardContainer>
      <template #header>
        {{ _("Import/Export Config") }}
      </template>
      <div class="button-group-row">
        <button class="btn btn-primary" @click="actions.importConfig">
          {{ _("Import") }}
        </button>
        <button class="btn btn-primary" @click="actions.exportConfig">
          {{ _("Export") }}
        </button>
        <button
          class="btn btn-secondary flex flex-row items-baseline gap-1"
          @click="actions.importFromSmbConf"
        >
          <span>
            {{ _("Import configuration from") }}
          </span>
          <span class="font-mono">
            {{ defaultSmbConfPath }}
          </span>
          <ToolTip class="self-center" above>
            {{
              _(
                "File Sharing uses Samba's net registry to configure shares. " +
                  "Click this button to import configuration from /etc/samba/smb.conf into the net registry for management."
              )
            }}
          </ToolTip>
        </button>

        <FileUploadButton hidden accept=".conf" ref="uploadRef" @upload="" />
      </div>
    </CardContainer>
  </CenteredCardColumn>
</template>
