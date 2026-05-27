<script setup lang="ts">
import {
  CenteredCardColumn,
  CardContainer,
  wrapActions,
  computedResult,
  reportSuccess,
  assertConfirm,
} from "@45drives/houston-common-ui";
import { Upload, getServerCluster, server, Command } from "@45drives/houston-common-lib";
import { computed, provide, ref, watch } from "vue";
import { serverClusterInjectionKey, cephClientNameInjectionKey } from "@/common/injectionKeys";

import { useUserSettings } from "@/common/user-settings";
import { getNFSManager, type INFSManager } from "@/tabs/nfs/nfs-manager";
import type { NFSExport } from "@/tabs/nfs/data-types";

import NFSExportListView from "@/tabs/nfs/ui/NFSExportListView.vue";

import SystemdServiceCard from "@/common/ui/SystemdServiceCard.vue";

const _ = cockpit.gettext;

const userSettings = useUserSettings();

const cluster = getServerCluster("pcs");
const [clusterRef] = computedResult(() => cluster);
provide(serverClusterInjectionKey, cluster);

const cephClientName = ref<`client.${string}`>("client.nfs");
provide(cephClientNameInjectionKey, cephClientName);

const nfsManager = computed(() => {
  const exportsPath = userSettings.value.nfs.confPath;
  return cluster.map((cluster) => getNFSManager(cluster, exportsPath));
});

const exportsSortPredicate = (a: NFSExport, b: NFSExport) =>
  a.path.localeCompare(b.path, undefined, { caseFirst: "false" });

const [nfsExports, refetchNFSExports] = computedResult<NFSExport[]>(
  () =>
    nfsManager.value
      .andThen((m) => m.getExports())
      .map((exports) => exports.sort(exportsSortPredicate)),
  []
);

let watchHandle: ReturnType<INFSManager["onExportsFileChanged"]> | undefined;
watch(
  nfsManager,
  (mgrResult) => {
    if (watchHandle) {
      watchHandle.remove();
    }
    mgrResult.map((m) => (watchHandle = m.onExportsFileChanged(refetchNFSExports)));
  },
  { immediate: true }
);

const addExport = (nfsExport: NFSExport) =>
  nfsManager.value
    .andThen((m) => m.addExport(nfsExport))
    .map(() => reportSuccess(_("Successfully added export for") + ` ${nfsExport.path}`));

const editExport = (nfsExport: NFSExport) =>
  nfsManager.value
    .andThen((m) => m.editExport(nfsExport))
    .map(() => reportSuccess(_("Successfully edited export for") + ` ${nfsExport.path}`));

const removeExport = (nfsExport: NFSExport) =>
  assertConfirm({
    header: _("Permanently delete export for") + ` ${nfsExport.path}?`,
    body: _("This cannot be undone.\nThis only removes the export definition, no files or folders will be deleted."),
    dangerous: true,
  })
    .andThen(() => nfsManager.value)
    .andThen((m) => m.removeExport(nfsExport))
    .map(() => reportSuccess(_("Successfully removed export for") + ` ${nfsExport.path}`));

const exportConfig = () =>
  nfsManager.value
    .andThen((m) => m.exportConfig())
    .map((config) =>
      server.downloadCommandOutput(
        new Command(["echo", config]),
        `cockpit-file-sharing_nfs_exported_${
          new Date().toISOString().replace(/:/g, "-").replace(/T/, "_").split(".")[0]
        }.exports`
      )
    );

const importConfig = () =>
  assertConfirm({
    header: _("Overwrite current configuration?"),
    body: _("This cannot be undone. You should export a copy of your config first."),
    dangerous: true,
  })
    .andThen(() => Upload.text(".exports"))
    .andThen((newConfigContents) =>
      nfsManager.value.andThen((m) => m.importConfig(newConfigContents))
    )
    .map(() => reportSuccess(_("Imported configuration")));

const actions = wrapActions({
  refetchNFSExports,
  addExport,
  editExport,
  removeExport,
  exportConfig,
  importConfig,
});
</script>

<template>
  <CenteredCardColumn>
    <NFSExportListView
      :nfsExports="nfsExports"
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
      name="NFS Service"
    />
  </CenteredCardColumn>
</template>
