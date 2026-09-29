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
  ToggleSwitch,
} from "@45drives/houston-common-ui";
import { Upload, getServerCluster, server, Command } from "@45drives/houston-common-lib";
import { onUnmounted, ref, watch } from "vue";
import { ExclamationTriangleIcon } from "@heroicons/vue/24/solid";

import { useUserSettings } from "@/common/user-settings";
import { NFSManager } from "@/tabs/nfs/nfs-manager";
import { getNfsPortStatus, type NFSPortStatus } from "@/tabs/nfs/nfs-port-status";
import type { NFSExport } from "@/tabs/nfs/data-types";

import NFSExportListView from "@/tabs/nfs/ui/NFSExportListView.vue";

import SystemdServiceCard from "@/common/ui/SystemdServiceCard.vue";
import type { ShareDefinition } from "@/common/share-common";
import { okAsync, ResultAsync } from "neverthrow";

import { promptResult } from "@/common/prompt";

const _ = cockpit.gettext;

const userSettings = useUserSettings();

const cluster = getServerCluster("pcs");
const [clusterRef] = computedResult(() => cluster);

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

const nfsPortStatuses = ref<NFSPortStatus[]>([]);
const checkingNfsPort = ref(false);
const updatingNfsPort = ref(false);

const checkNfsPort = async () => {
  if (!clusterRef.value || checkingNfsPort.value) return;
  checkingNfsPort.value = true;
  const nodes = Array.isArray(clusterRef.value) ? clusterRef.value : [clusterRef.value];
  try {
    nfsPortStatuses.value = await Promise.all(nodes.map(getNfsPortStatus));
  } finally {
    checkingNfsPort.value = false;
  }
};

watch(
  clusterRef,
  () => {
    void checkNfsPort();
  },
  { immediate: true }
);

const pollSystemdService = ref(true);

const pauseSystemdServicePolling = <TArgs, TResult, TErr>(
  action: (...args: TArgs[]) => ResultAsync<TResult, TErr>
) => {
  return (...args: TArgs[]) => {
    pollSystemdService.value = false;
    return action(...args)
      .map((r) => {
        pollSystemdService.value = true;
        return r;
      })
      .mapErr((e) => {
        pollSystemdService.value = true;
        return e;
      });
  };
};

const addExport = (nfsExport: ShareDefinition<NFSExport>) =>
  nfsManager.value
    ?.addShare(nfsExport)
    .map(() => reportSuccess(_("Successfully added export for") + ` ${nfsExport.path}`)) ??
  okAsync(undefined);

const editExport = (nfsExport: ShareDefinition<NFSExport>) => {
  const mgr = nfsManager.value;
  if (!mgr) {
    return okAsync(undefined);
  }
  return pauseSystemdServicePolling(() => mgr.editShare(nfsExport))().map(() =>
    reportSuccess(_("Successfully edited export for") + ` ${nfsExport.path}`)
  );
};

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
    .andThen(
      pauseSystemdServicePolling((nfsExport) => mgr.removeShare(nfsExport) ?? okAsync(nfsExport))
    )
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

const setNfsPortAllowed = (host: string, zone: string, port: number, allowed: boolean) => {
  if (updatingNfsPort.value) return okAsync(undefined);
  const nodes = clusterRef.value;
  const node = (Array.isArray(nodes) ? nodes : nodes ? [nodes] : []).find(
    (server) => (server.host || _("Local server")) === host
  );
  if (!node) return okAsync(undefined);
  updatingNfsPort.value = true;
  return assertConfirm({
    header: allowed ? _("Open NFS port in firewalld?") : _("Close NFS port in firewalld?"),
    body: `${host}: ${zone}, TCP ${port}. ${allowed ? _("This allows connections from all clients in this firewall zone and persists after reboot.") : _("This removes the explicit port allowance now and after reboot.")}`,
  })
    .andThen(() =>
      node.execute(
        new Command(
          ["firewall-cmd", `--zone=${zone}`, `--${allowed ? "add" : "remove"}-port=${port}/tcp`],
          {
            superuser: "try",
          }
        )
      )
    )
    .andThen(() =>
      node.execute(
        new Command(
          [
            "firewall-cmd",
            "--permanent",
            `--zone=${zone}`,
            `--${allowed ? "add" : "remove"}-port=${port}/tcp`,
          ],
          {
            superuser: "try",
          }
        )
      )
    )
    .map(() => {
      updatingNfsPort.value = false;
      void checkNfsPort();
      reportSuccess(
        allowed ? _("NFS port opened in firewalld") : _("NFS port closed in firewalld")
      );
    })
    .mapErr((error) => {
      updatingNfsPort.value = false;
      void checkNfsPort();
      return error;
    });
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
  setNfsPortAllowed,
});

let watchHandle: ReturnType<InstanceType<typeof NFSManager>["onExportsFileChanged"]> | undefined =
  undefined;
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
      :polling="pollSystemdService"
      @update:running="checkNfsPort"
    >
      <template #switches>
        <template v-for="status in nfsPortStatuses" :key="status.host">
          <ToggleSwitch
            v-for="zone in status.firewallZones"
            :key="zone.name"
            :model-value="zone.allowed === true"
            :disabled="checkingNfsPort || updatingNfsPort || !zone.manageable"
            @update:model-value="
              (allowed) => actions.setNfsPortAllowed(status.host, zone.name, status.port, allowed)
            "
          >
            <span class="inline-flex items-center gap-1">
              {{ _("NFS port") }} {{ status.port }}
              {{
                zone.allowed === true
                  ? _("is allowed.")
                  : zone.allowed === false
                    ? _("is blocked.")
                    : _("status unknown.")
              }}
              <ExclamationTriangleIcon
                v-if="zone.allowed === false"
                class="size-icon icon-warning"
              />
            </span>
            <template #description>
              {{ status.host }} - {{ zone.name }} -
              {{
                status.listening === true
                  ? _("Listening")
                  : status.listening === false
                    ? _("Not listening")
                    : _("Listener unknown")
              }}
              <span v-if="!zone.manageable && zone.allowed === true">
                - {{ _("Allowed by service or zone target") }}
              </span>
            </template>
          </ToggleSwitch>
          <ToggleSwitch v-if="status.firewallZones.length === 0" :model-value="false" disabled>
            {{ _("NFS port") }} {{ status.port }} {{ _("status unknown.") }}
            <template #description>
              {{ status.host }} -
              {{
                status.firewallActive === false
                  ? _("Firewalld is not running")
                  : _("Firewalld status unknown")
              }}
            </template>
          </ToggleSwitch>
        </template>
      </template>
    </SystemdServiceCard>
  </CenteredCardColumn>
</template>
