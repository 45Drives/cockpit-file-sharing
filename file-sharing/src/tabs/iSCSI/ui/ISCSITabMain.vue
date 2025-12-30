<template>
  <CenteredCardColumn v-if="driverInitalized">
    <VirtualDeviceTable />
    <TargetTable />
    <ConfigurationEditor v-if="!useUserSettings().value.iscsi.clusteredServer" @config-updated="refreshTables()" />
  </CenteredCardColumn>
</template>

<script setup lang="ts">
import { CenteredCardColumn, pushNotification, Notification, useTempObjectStaging,wrapAction } from "@45drives/houston-common-ui";
import { provide, reactive, ref } from "vue";
import { ISCSIDriverSingleServer } from "@/tabs/iSCSI/types/drivers/ISCSIDriverSingleServer";
import { BashCommand, Directory, ExitedProcess, ProcessError, getServer } from "@45drives/houston-common-lib";
import VirtualDeviceTable from "@/tabs/iSCSI/ui/screens/virtualDevice/VirtualDeviceTable.vue";
import TargetTable from "@/tabs/iSCSI/ui/screens/target/TargetTable.vue";
import type { VirtualDevice } from "@/tabs/iSCSI/types/VirtualDevice";
import ConfigurationEditor from "@/tabs/iSCSI/ui/screens/config/ConfigurationEditor.vue";
import { ISCSIDriverClusteredServer } from "@/tabs/iSCSI/types/drivers/ISCSIDriverClusteredServer";
import { useUserSettings } from "@/common/user-settings";
import { ResultAsync } from "neverthrow";
import type { ISCSIDriver } from "@/tabs/iSCSI/types/drivers/ISCSIDriver";
import type { Target } from "@/tabs/iSCSI/types/Target";

const _ = cockpit.gettext;

const driverInitalized = ref(false);

// File paths
const OLD_CONF_PATH = "/etc/scst/cockpit-iscsi.conf";
const NEW_CONF_PATH = "/etc/scst.conf";

// Function to check and move the configuration file
const moveConfigFileIfNeeded = async () => {
  const server = await getServer().unwrapOr(undefined);
  if (!server) return;

  const checkOldConf = await server.execute(new BashCommand(`[ -f "${OLD_CONF_PATH}" ] && echo "exists" || echo "notfound"`), false)
    .map((proc: ExitedProcess) => proc.getStdout().trim()) 
    .unwrapOr("notfound");

  const checkNewConf = await server.execute(new BashCommand(`[ -f "${NEW_CONF_PATH}" ] && echo "exists" || echo "notfound"`), false)
    .map((proc: ExitedProcess) => proc.getStdout().trim()) 
    .unwrapOr("notfound");

  if (checkOldConf === "exists" && checkNewConf === "notfound") {
    await server.execute(new BashCommand(`mv "${OLD_CONF_PATH}" "${NEW_CONF_PATH}"`), false)
      .map(() => console.log(`Moved ${OLD_CONF_PATH} to ${NEW_CONF_PATH}`))
      .mapErr((err) => console.error(`Failed to move config file: ${err.message}`));
  }
};

// Updated function to initialize the iSCSI driver
const createISCSIDriver = (): ResultAsync<ISCSIDriver, ProcessError> => {
  return getServer()
    .andThen((server) => {
      return checkForClusteredServer().andThen(() => {
        return ResultAsync.fromSafePromise(moveConfigFileIfNeeded()).andThen(() => {
          const driver = useUserSettings().value.iscsi.clusteredServer ? new ISCSIDriverClusteredServer(server) : new ISCSIDriverSingleServer(server);

          return driver.initialize()
            .map((driver) => {
              driverInitalized.value = true;
              return driver;
            })
            .mapErr((error) => {
              pushNotification(new Notification("Failed to initialize iSCSI Driver", `${error.message}`, "error"));
              return error;
            });
        });
      });
    });
};

const iSCSIDriver = wrapAction(createISCSIDriver)();
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

</script>
