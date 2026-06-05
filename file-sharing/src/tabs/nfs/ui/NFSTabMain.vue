<script setup lang="ts">
import {
  CenteredCardColumn,
  CardContainer,
  wrapActions,
  computedResult,
  reportSuccess,
  assertConfirm,
  pushNotification,
  Notification,
} from "@45drives/houston-common-ui";
import { Upload, getServerCluster, server, Command } from "@45drives/houston-common-lib";
import { computed, onUnmounted, provide, ref, watch } from "vue";
import { serverClusterInjectionKey, cephClientNameInjectionKey } from "@/common/injectionKeys";

import { useUserSettings } from "@/common/user-settings";
import { NFSManager } from "@/tabs/nfs/nfs-manager";
import type { NFSExport } from "@/tabs/nfs/data-types";

import NFSExportListView from "@/tabs/nfs/ui/NFSExportListView.vue";

import SystemdServiceCard from "@/common/ui/SystemdServiceCard.vue";
import type { ShareDefinition } from "@/common/share-common";
import { ok, okAsync } from "neverthrow";

import { prompt, promptResult } from "@/common/prompt";

const _ = cockpit.gettext;

const userSettings = useUserSettings();

const cluster = getServerCluster("pcs");
const [clusterRef] = computedResult(() => cluster);
provide(serverClusterInjectionKey, cluster);

const cephClientName = ref<`client.${string}`>("client.nfs");
provide(cephClientNameInjectionKey, cephClientName);

const [nfsManager] = computedResult(() => {
  const exportsPath = userSettings.value.nfs.confPath;
  return cluster.map((cluster) => new NFSManager(cluster, exportsPath));
});

const exportsSortPredicate = (a: NFSExport, b: NFSExport) =>
  a.path.localeCompare(b.path, undefined, { caseFirst: "false" });

const [nfsExports, refetchNFSExports] = computedResult<NFSExport[]>(
  () =>
    nfsManager.value?.listShares().map((exports) => exports.sort(exportsSortPredicate)) ??
    okAsync([]),
  []
);

const addExport = (nfsExport: ShareDefinition<NFSExport>) =>
  nfsManager.value
    ?.addShare(nfsExport)
    .map(() => reportSuccess(_("Successfully added export for") + ` ${nfsExport.path}`)) ??
  okAsync(undefined);

const editExport = (nfsExport: ShareDefinition<NFSExport>) =>
  nfsManager.value
    ?.editShare(nfsExport)
    .map(() => reportSuccess(_("Successfully edited export for") + ` ${nfsExport.path}`)) ??
  okAsync(undefined);

const removeExport = (nfsExport: NFSExport) => {
  const mgr = nfsManager.value;
  if (!mgr) {
    return okAsync(undefined);
  }
  return assertConfirm({
    header: _("Permanently delete export for") + ` ${nfsExport.path}?`,
    body: _(
      "This cannot be undone.\nThis only removes the export definition, no files or folders will be deleted."
    ),
    dangerous: true,
  })
    .andThen(() => mgr.getShareDefinition(nfsExport))
    .andThen((nfsExport) => mgr.removeShare(nfsExport) ?? okAsync(nfsExport))
    .map(() => reportSuccess(_("Successfully removed export for") + ` ${nfsExport.path}`));
};

const exportConfig = () =>
  nfsManager.value
    ?.exportConfig()
    .map((config) =>
      server.downloadCommandOutput(
        new Command(["echo", config]),
        `cockpit-file-sharing_nfs_exported_${
          new Date().toISOString().replace(/:/g, "-").replace(/T/, "_").split(".")[0]
        }.exports`
      )
    ) ?? okAsync(undefined);

const importConfig = () => {
  const mgr = nfsManager.value;
  if (!mgr) {
    return okAsync(undefined);
  }
  return assertConfirm({
    header: _("Overwrite current configuration?"),
    body: _("This cannot be undone. You should export a copy of your config first."),
    dangerous: true,
  })
    .andThen(() => Upload.text(".exports"))
    .andThen((newConfigContents) => mgr.importConfig(newConfigContents))
    .map(() => reportSuccess(_("Imported configuration")));
};

const checkIfClusterConfigInSync = () => {
  const mgr = nfsManager.value;
  if (!mgr) {
    return okAsync(undefined);
  }
  return mgr.clusterConfigInSync().map((inSync) => {
    if (!inSync) {
      const notif = new Notification(
        _("Cluster out of sync"),
        _("NFS configuration is not in sync across cluster nodes"),
        "error",
        "never"
      );
      notif.addAction(
        _("Sync now"),
        async () => {
          await actions.syncClusterConfig();
          actions.checkIfClusterConfigInSync();
        },
        true
      );
      pushNotification(notif);
    }
    return inSync;
  });
};

const syncClusterConfig = () => {
  const mgr = nfsManager.value;
  if (!mgr) {
    return okAsync(undefined);
  }
  return promptResult({
    type: "radio",
    choices: {
      [_("Merge")]: () => mgr.mergeClusterConfigs(),
      [_("Overwrite with current")]: () => mgr.overwriteClusterConfigs(),
    },
    headerText: _("Sync NFS configuration across cluster?"),
    bodyText: _(
      "This will attempt to merge the NFS exports configurations across all cluster nodes."
    ),
    cancelable: true,
  })
    .andThen((result) => result())
    .map(() => reportSuccess(_("Sync complete")));
};

const actions = wrapActions({
  refetchNFSExports,
  addExport,
  editExport,
  removeExport,
  exportConfig,
  importConfig,
  checkIfClusterConfigInSync,
  syncClusterConfig,
});

let watchHandle: ReturnType<NFSManager["onExportsFileChanged"]> | undefined = undefined;
onUnmounted(() => {
  watchHandle?.remove();
  watchHandle = undefined;
});
watch(
  nfsManager,
  (m) => {
    if (m === undefined) {
      return;
    }
    watchHandle?.remove();
    watchHandle = m.onExportsFileChanged(refetchNFSExports);
    actions.checkIfClusterConfigInSync();
  },
  { immediate: true }
);
</script>

<template>
  <CenteredCardColumn>
    <NFSExportListView
      v-if="nfsManager"
      :nfsExports="nfsExports"
      :manager="nfsManager"
      @addExport="(newConf, callback) => actions.addExport(newConf).map(() => callback?.())"
      @editExport="(newConf, callback) => actions.editExport(newConf).map(() => callback?.())"
      @removeExport="
        (nfsExport, callback) => actions.removeExport(nfsExport).map(() => callback?.())
      "
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
      </div>
    </CardContainer>
    <SystemdServiceCard
      v-if="clusterRef"
      serviceName="nfs-server.service"
      serviceManager="system"
      :server="clusterRef"
      warnIfStopped
      :name="_('NFS Service')"
    />
  </CenteredCardColumn>
</template>
