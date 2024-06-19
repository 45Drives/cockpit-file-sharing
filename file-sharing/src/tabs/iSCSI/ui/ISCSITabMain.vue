<template>
  <CenteredCardColumn v-if="iSCSIDriver">
    <VirtualDeviceTable />
    <TargetTable />
    <ConfigurationEditor v-if="!useUserSettings().value.iscsi.clusteredServer" @config-updated="refreshTables()" />
  </CenteredCardColumn>
</template>

<script setup lang="ts">
import { CenteredCardColumn, pushNotification, Notification, useTempObjectStaging } from "@45drives/houston-common-ui";
import { computed, provide, reactive, ref } from "vue";
import { ISCSIDriverSingleServer } from "@/tabs/iSCSI/types/drivers/ISCSIDriverSingleServer";
import { BashCommand, Directory, ProcessError, getServer } from "@45drives/houston-common-lib";
import VirtualDeviceTable from "@/tabs/iSCSI/ui/screens/virtualDevice/VirtualDeviceTable.vue";
import TargetTable from "@/tabs/iSCSI/ui/screens/target/TargetTable.vue";
import type { VirtualDevice } from "@/tabs/iSCSI/types/VirtualDevice";
import ConfigurationEditor from "@/tabs/iSCSI/ui/screens/config/ConfigurationEditor.vue";
import { ISCSIDriverClusteredServer } from "../types/drivers/ISCSIDriverClusteredServer";
import { useUserSettings } from "@/common/user-settings";
import { ResultAsync } from "neverthrow";
import type { ISCSIDriver } from "@/tabs/iSCSI/types/drivers/ISCSIDriver";

const _ = cockpit.gettext;

const createISCSIDriver = (): ResultAsync<ISCSIDriver, ProcessError> => {
  return getServer()
  .andThen((server) => {
    return checkForClusteredServer().andThen((clusteredServer) => {
      const driver = clusteredServer ? new ISCSIDriverClusteredServer(server) : new ISCSIDriverSingleServer(server);
      return driver.initialize();
    });
  })
}

const iSCSIDriver = createISCSIDriver();

if (!iSCSIDriver) {
  pushNotification(
    new Notification("Failed to initialize iSCSI Driver", "Unable to create iSCSI Driver.", "error")
  );
}

provide("iSCSIDriver", iSCSIDriver);
provide("virtualDevices", ref<VirtualDevice[]>());

let forceRefreshRecords = reactive<Record<string, boolean>>({});
provide("forceRefreshRecords", forceRefreshRecords);

function refreshTables() {
  forceRefreshRecords["devices"] = true;
  forceRefreshRecords["targets"] = true;
}

function checkForClusteredServer() {
  return ResultAsync.fromSafePromise(useUserSettings(true)).map((userSettings) => {
    if (!userSettings.value.iscsi.clusteredServerChecked) {
      console.log("Cluster Check")
      const {
        tempObject: tempConfig
      } = useTempObjectStaging(userSettings);

      tempConfig.value.iscsi.clusteredServerChecked = true;

      getServer().andThen((server) => {
        return server
        .execute(new BashCommand("command -v pcs"), false)
        .map((proc) => {
            if (proc.succeeded()) {
              new Directory(server, "/etc/ceph").getChildren({}).map((files) => {
                if (files.find((file) => file.basename() === "ceph.conf") === undefined || files.find((file) => file.basename() === "*.conf") === undefined) {
                  tempConfig.value.iscsi.clusteredServer = true;
                }
              })
            }
            
            userSettings.value = tempConfig.value;
          }
        );
      });
    }

    return userSettings.value.iscsi.clusteredServer;
  })
}
</script>
