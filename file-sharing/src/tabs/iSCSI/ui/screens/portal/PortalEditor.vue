<template>
  <CardContainer>
    <div v-if="tempPortal" class="space-y-content">
      <div class="space-y-content text-base">
        <div class="text-header">{{ _("New Portal") }}</div>
      </div>

      <InputLabelWrapper>
        <template #label>
          {{ _("Portal Address") }}
        </template>

        <InputField :placeholder="'The address for your portal'" v-model="tempPortal.address" />

        <ValidationResultView v-bind="portalAddressValidationResult" />
      </InputLabelWrapper>
    </div>

    <template v-slot:footer>
      <div class="button-group-row justify-end grow">
        <button class="btn btn-secondary" @click="handleClose">{{ "Cancel" }}</button>
        <button
          class="btn btn-primary"
          @click="promptCreatePortal"
          :disabled="!validationScope.isValid() || !modified "
        >
          {{ "Create" }}
        </button>
      </div>
    </template>
  </CardContainer>
</template>

<script setup lang="ts">
import {
  CardContainer,
  InputField,
  InputLabelWrapper,
  useTempObjectStaging,
  wrapActions,
  ValidationResultView,
  validationError,
  validationSuccess,
  ValidationScope,confirmBeforeAction
} from "@45drives/houston-common-ui";
import { ResultAsync } from "neverthrow";
import { computed, inject, ref, type Ref } from "vue";
import { BashCommand, getServerCluster, ProcessError } from "@45drives/houston-common-lib";
import type { Target } from "@/tabs/iSCSI/types/Target";
import type { ISCSIDriver } from "@/tabs/iSCSI/types/drivers/ISCSIDriver";
import { Portal } from "@/tabs/iSCSI/types/Portal";
import { useUserSettings } from "@/common/user-settings";

const _ = cockpit.gettext;

const props = defineProps<{ target: Target }>();

const emit = defineEmits(["closeEditor", "created"]);

const newPortal = ref<Portal>(new Portal(""));

const { tempObject: tempPortal, modified, resetChanges } = useTempObjectStaging(newPortal);

const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver")!;
  const canEditIscsi = inject<Ref<boolean>>("canEditIscsi");
  if (!canEditIscsi) throw new Error("canEditIscsi not provided");
  const canCreate = computed(() => canEditIscsi.value);let usedAddresses: string[] = [];

useUserSettings(true).then((userSettings) => {
  if (userSettings.value.iscsi.clusteredServer) {
    getServerCluster("pcs")
      .andThen((servers) =>
        ResultAsync.combine(
          servers.map((server) => server.execute(new BashCommand("hostname -I")))
        ).map((procs) => procs.map((proc) => proc.getStdout().trim().split(" ")))
      )
      .map((ips) => (usedAddresses = ips.flat()));
  }
});

const handleClose = () => {
  emit("closeEditor");
  resetChanges();
};

const createPortal = () => {
  return driver
    .andThen((driver) => driver.addPortalToTarget(props.target, tempPortal.value))
    .map(() => {handleClose(), emit("created")})
    .mapErr(
      (error) =>
        new ProcessError(`Unable to create portal ${tempPortal.value.address}: ${error.message}`)
    );
};

const actions = wrapActions({ createPortal });
const promptCreatePortal = confirmBeforeAction(
  {
    header: "Confirm",
    body: `Create this portal?

Changing iSCSI portal configuration can cause related targets or resources to restart and may disrupt active sessions using this target. 
It is strongly recommended to perform this action during a planned maintenance window or other\n downtime if there is any chance it could affect production workloads.`,
dangerous: true
  },
  actions.createPortal
);
const validationScope = new ValidationScope();

const { validationResult: portalAddressValidationResult } = validationScope.useValidator(() => {
  const userSettings = useUserSettings().value; // access ref right away for computed to trigger

  if (!tempPortal.value.address) {
    return validationError("A portal address is required.");
  }

  if (tempPortal.value.address.includes(":")) {
    return validationError("The port defaults to 3260.");
  }

  if (tempPortal.value.address.includes(" ")) {
    return validationError("The address has invalid characters.");
  }

  if (usedAddresses.includes(tempPortal.value.address)) {
    return validationError("The address is already in use.");
  }

  if (userSettings.iscsi.clusteredServer) {
    if (tempPortal.value.address === "0.0.0.0") {
      return validationError("A specific address needs to be specified for clusters.");
    }
  }

  return validationSuccess();
});
</script>
