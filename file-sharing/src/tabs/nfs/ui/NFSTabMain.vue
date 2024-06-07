<script setup lang="ts">
import {
  CenteredCardColumn,
  CardContainer,
  wrapActions,
  computedResult,
  reportSuccess,
  assertConfirm,
} from "@45drives/houston-common-ui";
import { Upload, Download, getServerCluster } from "@45drives/houston-common-lib";
import { computed, provide, ref } from "vue";
import { serverClusterInjectionKey, cephClientNameInjectionKey } from "@/common/injectionKeys";

import { useUserSettings } from "@/common/user-settings";
import { getNFSManager } from "@/tabs/nfs/nfs-manager";
import type { NFSExport } from "@/tabs/nfs/data-types";

import NFSExportListView from "@/tabs/nfs/ui/NFSExportListView.vue";

const _ = cockpit.gettext;

const userSettings = useUserSettings();

const cluster = getServerCluster("pcs");
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

const addExport = (nfsExport: NFSExport) =>
  nfsManager.value
    .andThen((m) => m.addExport(nfsExport))
    .andThen(() => refetchNFSExports())
    .map(() => reportSuccess(_("Successfully added export for") + ` ${nfsExport.path}`));

const editExport = (nfsExport: NFSExport) =>
  nfsManager.value
    .andThen((m) => m.editExport(nfsExport))
    .andThen(() => refetchNFSExports())
    .map(() => reportSuccess(_("Successfully edited export for") + ` ${nfsExport.path}`));

const removeExport = (nfsExport: NFSExport) =>
  assertConfirm({
    header: _("Permanently delete export for") + ` ${nfsExport.path}?`,
    body: _("This cannot be undone."),
    dangerous: true,
  })
    .andThen(() => nfsManager.value)
    .andThen((m) => m.removeExport(nfsExport))
    .andThen(() => refetchNFSExports())
    .map(() => reportSuccess(_("Successfully removed export for") + ` ${nfsExport.path}`));

const exportConfig = () =>
  nfsManager.value
    .andThen((m) => m.exportConfig())
    .map((config) =>
      Download.text(
        config,
        `cockpit-file-sharing_nfs_exported_${new Date()
          .toISOString()
          .replace(/:/g, "-")
          .replace(/T/, "_")}.exports`
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
    .andThen(() => refetchNFSExports())
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
      <div class="button-group-row">
        <button class="btn btn-primary" @click="actions.importConfig">
          {{ _("Import") }}
        </button>
        <button class="btn btn-primary" @click="actions.exportConfig">
          {{ _("Export") }}
        </button>
      </div>
    </CardContainer>
  </CenteredCardColumn>
</template>
