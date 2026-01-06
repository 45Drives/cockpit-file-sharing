<template>
  <CenteredCardColumn v-if="driverInitalized">
    <div v-if="useUserSettings().value.iscsi.clusteredServer && !has45DrivesOcfProvider"
      class="mb-4 rounded border border-yellow-500 bg-yellow-50 p-4 text-yellow-900" role="alert">
      <div class="font-semibold">Missing required 45Drives packages</div>
      <div class="mt-1 text-sm">
        This system is missing the latest 45Drives iSCSI cluster packages. Please create a support ticket and our
        service team will reach out.
        Until then, this page is read-only and you won’t be able to add new resources to a target.
      </div>
    </div>

    <VirtualDeviceTable />
    <TargetTable />
    <ConfigurationEditor v-if="!useUserSettings().value.iscsi.clusteredServer" @config-updated="refreshTables()" />
  </CenteredCardColumn>
</template>

<script setup lang="ts">
import { CenteredCardColumn, pushNotification, Notification, useTempObjectStaging, wrapAction } from "@45drives/houston-common-ui";
import { computed, provide, reactive, ref } from "vue";
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
const has45DrivesOcfProvider = ref(false);
provide("has45DrivesOcfProvider", has45DrivesOcfProvider);
const canEdit = computed(() => !useUserSettings().value.iscsi.clusteredServer || has45DrivesOcfProvider.value);
provide("canEditIscsi", canEdit);

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


const createISCSIDriver = (): ResultAsync<ISCSIDriver, ProcessError> => {
  return getServer().andThen((server) => {
    return checkForClusteredServer().andThen(() => {
      return ResultAsync.fromSafePromise(moveConfigFileIfNeeded()).andThen(() => {
        const isCluster = useUserSettings().value.iscsi.clusteredServer;

        const detectOcfProviderIfClustered = isCluster
          ? detect45DrivesOcfProvider().map((exists) => {
            has45DrivesOcfProvider.value = exists;
            return exists;
          })
          : ResultAsync.fromSafePromise(Promise.resolve(true)).map(() => {
            has45DrivesOcfProvider.value = false;
            return false;
          });

        return detectOcfProviderIfClustered.andThen(() => {
          const driver = isCluster
            ? new ISCSIDriverClusteredServer(server)
            : new ISCSIDriverSingleServer(server);

          return driver.initialize()
            .map((driver) => {
              driverInitalized.value = true;
              return driver;
            })
            .mapErr((error) => {
              pushNotification(
                new Notification("Failed to initialize iSCSI Driver", `${error.message}`, "error")
              );
              return error;
            });
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
const detect45DrivesOcfProvider = (): ResultAsync<boolean, ProcessError> => {
  return getServer().andThen((server) =>
    server.execute(
      new BashCommand(`
        (
          test -d /usr/lib/ocf/resource.d/45drives &&
          ls -1 /usr/lib/ocf/resource.d/45drives 2>/dev/null | grep -q .
        ) || (
          test -d /usr/libexec/ocf/resource.d/45drives &&
          ls -1 /usr/libexec/ocf/resource.d/45drives 2>/dev/null | grep -q .
        ) && echo yes || echo no
      `),
      false
    ).map((proc) => proc.getStdout().trim() === "yes")
  );
};



</script>
