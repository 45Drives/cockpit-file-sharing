<template>
  <CenteredCardColumn v-if="iSCSIDriver">
    <VirtualDeviceTable />
    <TargetTable />
    <ConfigurationEditor @config-updated="refreshTables()" />
  </CenteredCardColumn>
</template>

<script setup lang="ts">
import { CenteredCardColumn, pushNotification, Notification } from "@45drives/houston-common-ui";
import { provide, reactive, ref } from "vue";
import { ISCSIDriverSingleServer } from "@/tabs/iSCSI/types/drivers/ISCSIDriverSingleServer";
import { BashCommand, getServer } from "@45drives/houston-common-lib";
import VirtualDeviceTable from "@/tabs/iSCSI/ui/screens/virtualDevice/VirtualDeviceTable.vue";
import TargetTable from "@/tabs/iSCSI/ui/screens/target/TargetTable.vue";
import type { VirtualDevice } from "@/tabs/iSCSI/types/VirtualDevice";
import ConfigurationEditor from "@/tabs/iSCSI/ui/screens/config/ConfigurationEditor.vue";
import { err, ok } from "neverthrow";
import { ISCSIDriverClusteredServer } from "../types/drivers/ISCSIDriverClusteredServer";

const _ = cockpit.gettext;

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

function createISCSIDriver() {
  return getServer().map((server) => {
    return new ISCSIDriverSingleServer(server);
  });
}

// function createISCSIDriver() {
//   return getServer().map((server) => {
//     return server
//       .execute(new BashCommand("command -v pcs"), false)
//       .andThen((proc) =>
//         proc.succeeded()
//           ? ok(new ISCSIDriverClusteredServer(server))
//           : err(new ISCSIDriverSingleServer(server))
//       );
//   });
// }

function refreshTables() {
  forceRefreshRecords["devices"] = true;
  forceRefreshRecords["targets"] = true;
}
</script>
