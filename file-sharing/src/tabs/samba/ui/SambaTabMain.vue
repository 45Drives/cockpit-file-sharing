<script setup lang="ts">
import {
  // Download,
  Upload,
  getServerCluster,
  type SambaShareConfig,
  type SambaGlobalConfig,
  Command,
  BashCommand,
  FileSystemNode,
  server,
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

import { watch, computed, provide } from "vue";

import { SambaManager } from "@/tabs/samba/samba-manager";
import { ok, okAsync } from "neverthrow";

import SystemdServiceCard from "@/common/ui/SystemdServiceCard.vue";
import type { ShareDefinition } from "@/common/share-common";

import { sambaManagerInjectionKey } from "./injectionKeys";

const _ = cockpit.gettext;

const userSettings = useUserSettings();

const smbConfPath = computed(() => userSettings.value.samba.confPath);

const cluster = getServerCluster("ctdb");
const [clusterRef] = computedResult(() => cluster);

const sambaManager = new SambaManager(server);
provide(sambaManagerInjectionKey, sambaManager);

const [globalConf, reloadGlobalConf] = computedResult(() => sambaManager.getGlobalConfig());

const shareSortPredicate = (a: SambaShareConfig, b: SambaShareConfig) =>
  a.name.localeCompare(b.name, undefined, { caseFirst: "false" });

const [shares, reloadShares] = computedResult(
  () => sambaManager.getShares().map((s) => s.sort(shareSortPredicate)),
  []
);

const applyGlobalSettings = (newSettings: SambaGlobalConfig) =>
  sambaManager
    .editGlobal(newSettings)
    .andThen(() => reloadGlobalConf())
    .map(() => reportSuccess(_("Updated global Samba configuration.")));

const reloadShare = (shareName: string) =>
  sambaManager.getShare(shareName).map((newShare) => {
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

const addShare = (share: ShareDefinition<SambaShareConfig>) =>
  sambaManager
    .addShare(share)
    .andThen(() => reloadShare(share.name))
    .map(() => reportSuccess(`${_("Successfully added share")} ${share.name}`));

const editShare = (share: ShareDefinition<SambaShareConfig>) =>
  sambaManager
    .editShare(share)
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
    .andThen(() =>
      confirm({
        header: _("Kick users from") + ` ${share.name}?`,
        body: _("Run `smbcontrol smbd close-share` before deleting share?"),
        confirmButtonText: _("Yes"),
        cancelButtonText: _("No"),
      })
    )
    .andThen((kickUsers) => {
      if (kickUsers) {
        return sambaManager.closeSambaShare(share.name);
      }
      return okAsync(null);
    })
    .andThen(() => sambaManager.getShareDefinition(share))
    .andThen((share) => sambaManager.removeShare(share))
    .map(() => (shares.value = shares.value.filter((s) => s.name !== share.name)))
    .map(() => reportSuccess(`${_("Successfully removed share")} ${share.name}`));

const checkIfSmbConfIncludesRegistry = (smbConfPath: string) =>
  cluster
    .orElse(() => ok([server]))
    .andThen((cluster) =>
      sambaManager
        .checkIfSambaConfIncludesRegistry(smbConfPath, cluster)
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
        })
    );

const fixSmbConfIncludeRegistry = (smbConfPath: string) =>
  cluster
    .orElse(() => ok([server]))
    .andThen((cluster) =>
      sambaManager
        .patchSambaConfIncludeRegistry(smbConfPath, cluster)
        .map(() => reportSuccess(_("Added `include = registry` to ") + smbConfPath))
    );

const importConfig = () =>
  assertConfirm({
    header: _("Overwrite current configuration?"),
    body: _(
      "Any sections in uploaded file will overwrite current configuration sections. You should export a copy of your config first."
    ),
    dangerous: true,
  })
    .andThen(() => Upload.text(".conf"))
    .andThen((newConfigContents) => sambaManager.importConfig(newConfigContents))
    .andThen(() => reloadGlobalConf())
    .andThen(() => reloadShares())
    .map(() => reportSuccess(_("Imported configuration")));

const exportConfig = () =>
  sambaManager
    .exportConfig()
    .map((config) =>
      server.downloadCommandOutput(
        new Command(["echo", config]),
        `cockpit-file-sharing_samba_exported_${
          new Date().toISOString().replace(/:/g, "-").replace(/T/, "_").split(".")[0]
        }.conf`
      )
    );
// .map((config) =>
//   Download.text(
//     config,
//     `cockpit-file-sharing_samba_exported_${new Date()
//       .toISOString()
//       .replace(/:/g, "-")
//       .replace(/T/, "_")}.conf`
//   )
// );

const importFromSmbConf = (smbConfPath: string) =>
  assertConfirm({
    header: _("Overwrite current configuration?"),
    body: _(
      "Any sections in smb.conf will overwrite current configuration sections. You should export a copy of your config first."
    ),
    dangerous: true,
  })
    .andThen(() => sambaManager.importFromSambaConf(smbConfPath))
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

const [smbServiceName] = computedResult<"smb.service" | "smbd.service">(() =>
  server
    .execute(new BashCommand("systemctl list-unit-files | grep smb", [], { superuser: "try" }))
    .map((p) => p.getStdout().trim())
    .map((unit_list) => {
      if (unit_list.includes("smbd.service")) {
        return "smbd.service";
      }
      return "smb.service";
    })
);

// ubuntu 20.04 (and maybe others) quirk with enabling service while unit is running causing service to appear stopped:
const [ubu20QuirkStopBeforeEnable] = computedResult(() => {
  const serviceName = smbServiceName.value;
  if (!serviceName) {
    return okAsync(undefined);
  }
  return new FileSystemNode(server, `/etc/init.d/${serviceName.replace(".service", "")}`).exists();
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
      :manager="sambaManager"
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
    <SystemdServiceCard
      v-if="clusterRef && smbServiceName && ubu20QuirkStopBeforeEnable !== undefined"
      :name="_('Samba Service')"
      :serviceName="smbServiceName"
      :server="clusterRef"
      :mustStopBeforeEnable="ubu20QuirkStopBeforeEnable"
      warnIfStopped
    >
    </SystemdServiceCard>
  </CenteredCardColumn>
</template>
