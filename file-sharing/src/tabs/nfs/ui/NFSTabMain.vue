<script setup lang="ts">
import {
  CenteredCardColumn,
  CardContainer,
  wrapActions,
  pushNotification,
  Notification,
  type Action,
  computedResult,
  reportSuccess,
  assertConfirm,
} from "@45drives/houston-common-ui";
import { getServerCluster } from "@/common/getServerCluster";
import { computed, provide, ref, type Ref } from "vue";
import { ResultAsync, okAsync, errAsync, Result, ok, err } from "neverthrow";
import { serverClusterInjectionKey, cephClientNameInjectionKey } from "@/common/injectionKeys";

import { useUserSettings } from "@/common/user-settings";
import { getNFSManager, type INFSManager } from "@/tabs/nfs/nfs-manager";
import type { NFSExport } from "@/tabs/nfs/data-types";

import NFSExportEditor from "@/tabs/nfs/ui/NFSExportEditor.vue";
import NFSExportListView from "@/tabs/nfs/ui/NFSExportListView.vue";

const _ = cockpit.gettext;

const userSettings = useUserSettings();

const exportsFilePath = computed(() => userSettings.value.nfs.confPath);

const cluster = getServerCluster("pcs");
provide(serverClusterInjectionKey, cluster);
const cephClientName = ref<`client.${string}`>("client.nfs");
provide(cephClientNameInjectionKey, cephClientName);

const nfsManager = computed(() => {
  const exportsPath = exportsFilePath.value;
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

const actions = wrapActions({
  refetchNFSExports,
  addExport,
  editExport,
  removeExport,
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
  </CenteredCardColumn>
</template>
