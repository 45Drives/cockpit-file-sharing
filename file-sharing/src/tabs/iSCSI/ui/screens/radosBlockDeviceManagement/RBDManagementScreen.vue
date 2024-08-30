<template>
  <CardContainer
  :style="{'width': '1000px'}">
      <RBDTable/>

  <template v-slot:footer>
        <div class="button-group-row justify-end grow">
            <button
                class="btn btn-secondary"
                @click="emit('close')"
            >{{ ("Close") }}</button>
        </div>
    </template>
  </CardContainer>
</template>

<script setup lang="ts">
import type { LogicalVolume } from "@/tabs/iSCSI/types/cluster/LogicalVolume";
import type { RadosBlockDevice } from "@/tabs/iSCSI/types/cluster/RadosBlockDevice";
import type { ISCSIDriverClusteredServer } from "@/tabs/iSCSI/types/drivers/ISCSIDriverClusteredServer";
import RBDDeviceCreationScreen from "@/tabs/iSCSI/ui/screens/radosBlockDeviceManagement/RBDDeviceCreationScreen.vue";
import RBDTable from "@/tabs/iSCSI/ui/screens/radosBlockDeviceManagement/RBDTable.vue";
import type { ProcessError } from "@45drives/houston-common-lib";
import {
  CardContainer,
  wrapActions
} from "@45drives/houston-common-ui";
import type { ResultAsync } from "neverthrow";
import { inject, ref } from "vue";

const _ = cockpit.gettext;

const emit = defineEmits<{
  (e: "close"): void;
}>();

</script>