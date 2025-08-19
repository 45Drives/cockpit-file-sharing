<script setup lang="ts">
import {
  getServer,
  Download,
  Upload,
  getServerCluster,
  type SambaShareConfig,
  type SambaGlobalConfig,
} from "@45drives/houston-common-lib";
import {
  CenteredCardColumn,
  Notification,
  pushNotification,
  wrapActions,
  CardContainer,
  assertConfirm,
  confirm,
  reportSuccess,
  computedResult,
  ToolTip,
} from "@45drives/houston-common-ui";
import { useUserSettings } from "@/common/user-settings";

import GlobalConfigEditor from "./GlobalConfigEditor.vue";
import ShareListView from "@/tabs/samba/ui/ShareListView.vue";

import { provide, ref, watch, computed } from "vue";
import { serverClusterInjectionKey, cephClientNameInjectionKey } from "@/common/injectionKeys";

import { HookedSambaManager as SambaManager } from "@/tabs/samba/samba-manager";
import { okAsync } from "neverthrow";

const _ = cockpit.gettext;

const userSettings = useUserSettings();

const smbConfPath = computed(() => userSettings.value.samba.confPath);

provide(serverClusterInjectionKey, getServerCluster("ctdb"));
const cephClientName = ref<`client.${string}`>("client.samba");
provide(cephClientNameInjectionKey, cephClientName);

const server = getServer();

const sambaManager = server.map((server) => new SambaManager(server));

const [globalConf, reloadGlobalConf] = computedResult(() =>
  sambaManager.andThen((sm) => sm.getGlobalConfig())
);

const shareSortPredicate = (a: SambaShareConfig, b: SambaShareConfig) =>
  a.name.localeCompare(b.name, undefined, { caseFirst: "false" });

const [shares, reloadShares] = computedResult(
  () => sambaManager.andThen((sm) => sm.getShares()).map((s) => s.sort(shareSortPredicate)),
  []
);

const applyGlobalSettings = (newSettings: SambaGlobalConfig) =>
  sambaManager
    .andThen((sm) => sm.editGlobal(newSettings))
    .andThen(() => reloadGlobalConf())
    .map(() => reportSuccess(_("Updated global Samba configuration.")));

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
    body: _(
      "This cannot be undone.\nThis only removes the share definition, no files or folders will be deleted."
    ),
    dangerous: true,
  })
    .andThen(() => sambaManager)
    .andThen((sm) => {
      return confirm({
        header: _("Kick users from") + ` ${share.name}?`,
        body: _("Run `smbcontrol smbd close-share` before deleting share?"),
        confirmButtonText: _("Yes"),
        cancelButtonText: _("No"),
      })
        .andThen((kickUsers) => {
          if (kickUsers) {
            return sm.closeSambaShare(share.name);
          }
          return okAsync(null);
        })
        .andThen(() => sm.removeShare(share));
    })
    .map(() => (shares.value = shares.value.filter((s) => s.name !== share.name)))
    .map(() => reportSuccess(`${_("Successfully removed share")} ${share.name}`));

const checkIfSmbConfIncludesRegistry = (smbConfPath: string) =>
  sambaManager
    .andThen((sm) => sm.checkIfSambaConfIncludesRegistry(smbConfPath))
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
            await actions.fixSmbConfIncludeRegistry(smbConfPath);
          })
        );
      }
    });

const fixSmbConfIncludeRegistry = (smbConfPath: string) =>
  sambaManager
    .andThen((sm) => sm.patchSambaConfIncludeRegistry(smbConfPath))
    .map(() => reportSuccess(_("Added `include = registry` to ") + smbConfPath));

const importConfig = () =>
  assertConfirm({
    header: _("Overwrite current configuration?"),
    body: _(
      "Any sections in uploaded file will overwrite current configuration sections. You should export a copy of your config first."
    ),
    dangerous: true,
  })
    .andThen(() => Upload.text(".conf"))
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
      Download.text(
        config,
        `cockpit-file-sharing_samba_exported_${new Date()
          .toISOString()
          .replace(/:/g, "-")
          .replace(/T/, "_")}.conf`
      )
    );

const importFromSmbConf = (smbConfPath: string) =>
  assertConfirm({
    header: _("Overwrite current configuration?"),
    body: _(
      "Any sections in smb.conf will overwrite current configuration sections. You should export a copy of your config first."
    ),
    dangerous: true,
  })
    .andThen(() => sambaManager)
    .andThen((sm) => sm.importFromSambaConf(smbConfPath))
    .andThen(() => reloadGlobalConf())
    .andThen(() => reloadShares())
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

watch(smbConfPath, () => actions.checkIfSmbConfIncludesRegistry(smbConfPath.value), {
  immediate: true,
});
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
      <div class="button-group-row flex-wrap">
        <button class="btn btn-primary" @click="actions.importConfig">
          {{ _("Import") }}
        </button>
        <button class="btn btn-primary" @click="actions.exportConfig">
          {{ _("Export") }}
        </button>
        <button
          class="btn btn-secondary inline-flex flex-row items-center gap-1"
          @click="actions.importFromSmbConf(smbConfPath)"
        >
          <span class="space-x-1">
            <span>
              {{ _("Import configuration from") }}
            </span>
            <span class="font-mono">
              {{ smbConfPath }}
            </span>
          </span>
          <ToolTip above>
            {{
              _(
                "File Sharing uses Samba's net registry to configure shares. " +
                  "Click this button to import configuration from /etc/samba/smb.conf into the net registry for management."
              )
            }}
          </ToolTip>
        </button>
      </div>
    </CardContainer>
  </CenteredCardColumn>
</template>
