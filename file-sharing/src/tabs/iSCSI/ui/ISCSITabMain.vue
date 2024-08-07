<template>
  <CenteredCardColumn v-if="driverInitalized">
    <VirtualDeviceTable />
    <TargetTable />
    <ConfigurationEditor v-if="!useUserSettings().value.iscsi.clusteredServer" @config-updated="refreshTables()" />
  </CenteredCardColumn>
</template>

<script setup lang="ts">
import { CenteredCardColumn, pushNotification, Notification, useTempObjectStaging } from "@45drives/houston-common-ui";
import { provide, reactive, ref } from "vue";
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
import type { Target } from "@/tabs/iSCSI/types/Target";
import { PCSResourceManager } from "@/tabs/iSCSI/types/cluster/PCSResourceManager";

const _ = cockpit.gettext;

const driverInitalized = ref(false);

const createISCSIDriver = (): ResultAsync<ISCSIDriver, ProcessError> => {
  testFunction();
  return getServer()
  .andThen((server) => {
    return checkForClusteredServer().andThen(() => {
      const driver = useUserSettings().value.iscsi.clusteredServer ? new ISCSIDriverClusteredServer(server) : new ISCSIDriverSingleServer(server);
      return driver.initialize()
        .map((driver) => {
          driverInitalized.value = true;
          return driver;
        })
        .mapErr((error) => {
          pushNotification(new Notification("Failed to initialize iSCSI Driver", `${error.message}`, "error"))
          return error;
        }
      );
    });
  })
}

const iSCSIDriver = createISCSIDriver();

provide("iSCSIDriver", iSCSIDriver);
provide("virtualDevices", ref<VirtualDevice[]>());
provide("targets", ref<Target[]>());

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
                tempConfig.value.iscsi.clusteredServer = (files.find((file) => file.basename() === "ceph.conf") === undefined || files.find((file) => file.basename() === "*.conf") === undefined)
                userSettings.value = tempConfig.value;
              })
            }

            userSettings.value = tempConfig.value;
          }
        );
      });
    }
  })
}

function testFunction() {
  return getServer()
  .map((server) => new PCSResourceManager(server))
  .map((manager) => {
      manager.initialize()
      .map(() => {
        console.log(`Current resources:`)
        console.log(manager.currentResources)
        console.log(`Current groups:`)
        console.log(manager.currentResourceGroups)
      })
    }
  )
}
</script>
