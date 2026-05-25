<script setup lang="ts">
import {
  CenteredCardColumn,
  CardContainer,
  wrapActions,
  computedResult,
  reportSuccess,
  assertConfirm,
  ToggleSwitch,
  ToggleSwitchGroup,
  reportError,
} from "@45drives/houston-common-ui";
import {
  Upload,
  /* Download, */ getServerCluster,
  server,
  Command,
} from "@45drives/houston-common-lib";
import { computed, onMounted, onUnmounted, provide, ref, watch } from "vue";
import { serverClusterInjectionKey, cephClientNameInjectionKey } from "@/common/injectionKeys";
import { okAsync } from "neverthrow";

import { useUserSettings } from "@/common/user-settings";
import { getNFSManager, type INFSManager } from "@/tabs/nfs/nfs-manager";
import type { NFSExport } from "@/tabs/nfs/data-types";

import NFSExportListView from "@/tabs/nfs/ui/NFSExportListView.vue";

import { ExclamationTriangleIcon } from "@heroicons/vue/24/solid";

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

const [_nfsServiceRunning, refetchNFSServiceRunning] = computedResult(
  () => nfsManager.value.andThen((m) => m.nfsServiceRunning()),
  false
);

const [_nfsServiceEnabled, refetchNFSServiceEnabled] = computedResult(
  () => nfsManager.value.andThen((m) => m.nfsServiceEnabled()),
  false
);

let servicePollHandle: number;
onMounted(() => {
  servicePollHandle = window.setInterval(() => {
    refetchNFSServiceRunning();
    refetchNFSServiceEnabled();
  }, 5000);
});

onUnmounted(() => {
  window.clearInterval(servicePollHandle);
});

const setNFSServiceRunning = (running: boolean) =>
  (running
    ? nfsManager.value.andThen((m) => m.startNFSService())
    : nfsManager.value.andThen((m) => m.stopNFSService())
  ).andThen(() => refetchNFSServiceRunning());

const setNFSServiceEnabled = (enabled: boolean) =>
  (enabled
    ? nfsManager.value.andThen((m) => m.enableNFSService())
    : nfsManager.value.andThen((m) => m.disableNFSService())
  ).andThen(() => refetchNFSServiceEnabled());

const nfsServiceRunning = computed<boolean>({
  get: () => _nfsServiceRunning.value,
  set: (value) => actions.setNFSServiceRunning(value),
});

const nfsServiceEnabled = computed<boolean>({
  get: () => _nfsServiceEnabled.value,
  set: (value) => actions.setNFSServiceEnabled(value),
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
  refetchNFSServiceRunning().andThen((nfsServiceWasRunning) =>
    nfsManager.value
      .andThen((m) =>
        m.editExport(nfsExport).andThen(() => {
          if (nfsServiceWasRunning) {
            return setNFSServiceRunning(true);
          } else {
            return okAsync(null);
          }
        })
      )
      .map(() => reportSuccess(_("Successfully edited export for") + ` ${nfsExport.path}`))
  );

const removeExport = (nfsExport: NFSExport) =>
  assertConfirm({
    header: _("Permanently delete export for") + ` ${nfsExport.path}?`,
    body: _(
      "This cannot be undone.\nThis only removes the export definition, no files or folders will be deleted."
    ),
    dangerous: true,
  })
    .andThen(() => nfsManager.value)
    .andThen((m) =>
      refetchNFSServiceRunning().andThen((nfsServiceWasRunning) =>
        m.removeExport(nfsExport).andThen(() => {
          if (nfsServiceWasRunning) {
            return setNFSServiceRunning(true);
          } else {
            return okAsync(null);
          }
        })
      )
    )
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
// .map((config) =>
//   Download.text(
//     config,
//     `cockpit-file-sharing_nfs_exported_${new Date()
//       .toISOString()
//       .replace(/:/g, "-")
//       .replace(/T/, "_")}.exports`
//   )
// );

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
  setNFSServiceRunning,
  setNFSServiceEnabled,
});
</script>

<template>
  <CenteredCardColumn>
    <CardContainer>
      <template #header>
        {{ _("NFS Service") }}
      </template>
      <ToggleSwitchGroup>
        <ToggleSwitch v-model="nfsServiceRunning">
          <div class="inline-flex flex-row gap-1">
            {{ _("NFS Service") }}
            {{ nfsServiceRunning ? _(" is running.") : _("is stopped.") }}
            <ExclamationTriangleIcon v-if="!nfsServiceRunning" class="size-icon icon-warning" />
          </div>
          <template #description>
            {{ nfsServiceRunning ? _("Click toggle to stop.") : _("Click toggle to start.") }}
          </template>
        </ToggleSwitch>
        <ToggleSwitch v-model="nfsServiceEnabled">
          {{ _("NFS Service") }}
          {{ nfsServiceEnabled ? _(" is enabled.") : _("is disabled.") }}
          <template #description>
            {{ nfsServiceEnabled ? _("Click toggle to disable.") : _("Click toggle to enable.") }} <br/>
            {{ _("When enabled, the NFS service will automatically start when the system boots.") }}
          </template>
        </ToggleSwitch>
      </ToggleSwitchGroup>
    </CardContainer>
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
  </CenteredCardColumn>
</template>
