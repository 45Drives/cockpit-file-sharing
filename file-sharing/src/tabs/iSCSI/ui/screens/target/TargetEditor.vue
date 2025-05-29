<template>
  <CardContainer>
    <div v-if="tempTarget" class="space-y-content">
      <div class="space-y-content text-base">
        <div class="text-header">{{ _("New Target") }}</div>
      </div>

      <InputLabelWrapper>
        <template #label>
          {{ _("Target Name") }}
        </template>

        <InputField :placeholder="'A unique name for your target'" v-model="tempTarget.name" />
        <ValidationResultView v-bind="targetNameValidationResult" />
      </InputLabelWrapper>

      <InputLabelWrapper v-if= "useUserSettings().value.iscsi.clusteredServer">
        <template #label>
          {{ _("Portal Address") }}
        </template>

        <InputField :placeholder="'The address for the portal'" v-model="tempPortal.address" />

        <ValidationResultView v-bind="portalAddressValidationResult" />
      </InputLabelWrapper>
    </div>

    <template v-slot:footer>
      <div class="button-group-row justify-end grow">
        <button class="btn btn-secondary" @click="handleClose">{{ "Cancel" }}</button>
        <button
          class="btn btn-primary"
          @click="actions.createTarget"
          :disabled="!validationScope.isValid()"
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
  validationError,
  validationSuccess,
  ValidationResultView,
  wrapActions,
  ValidationScope,
} from "@45drives/houston-common-ui";
import { ResultAsync } from "neverthrow";
import { inject, ref } from "vue";
import { BashCommand, getServerCluster, ProcessError } from "@45drives/houston-common-lib";
import { Target } from "@/tabs/iSCSI/types/Target";
import type { ISCSIDriver } from "@/tabs/iSCSI/types/drivers/ISCSIDriver";
import { Portal } from "@/tabs/iSCSI/types/Portal";
import { useUserSettings } from "@/common/user-settings";

const _ = cockpit.gettext;

const props = defineProps<{ existingTargets: Target[] }>();

const emit = defineEmits(["closeEditor"]);

const newTarget = ref<Target>(Target.empty());

const newPortal = ref<Portal>(new Portal(""));

const { tempObject: tempTarget, modified: targetModified, resetChanges: resetChangesTarget } = useTempObjectStaging(newTarget);

const { tempObject: tempPortal, modified: portalModified, resetChanges: resetChangesPortal } = useTempObjectStaging(newPortal);

const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver")!;

let usedAddresses: string[] = [];

getServerCluster("pcs").andThen((servers) => 
  ResultAsync.combine(servers.map((server) => server.execute(new BashCommand("hostname -I"))))
  .map((procs) => procs.map((proc) => proc.getStdout().trim().split(" ")))).map((ips) => usedAddresses = ips.flat())

const handleClose = () => {
  emit("closeEditor");
  resetChangesTarget();
  resetChangesPortal();
};

const createTarget = () => {
  return ResultAsync.fromSafePromise(useUserSettings(true)).andThen(userSettings => {
    if (userSettings.value.iscsi.clusteredServer) {
      return driver
      .andThen((driver) => {
        return driver.createTarget(tempTarget.value)
        .andThen(() => driver.addPortalToTarget(tempTarget.value, tempPortal.value))
        .mapErr((err) => {
          driver.removeTarget(tempTarget.value);
          return err;
        })
      })
      .map(() => handleClose())
      .mapErr(
        (error) =>
          new ProcessError(`Unable to create target ${tempTarget.value.name}: ${error.message}`)
      );
    }
    else {
      return driver
      .andThen((driver) => driver.createTarget(tempTarget.value))
      .map(() => handleClose())
      .mapErr(
        (error) =>
          new ProcessError(`Unable to create target ${tempTarget.value.name}: ${error.message}`)
      );
    }
  })
};

const actions = wrapActions({ createTarget });

const validationScope = new ValidationScope();

const { validationResult: targetNameValidationResult } = validationScope.useValidator(() => {
  if (!tempTarget.value.name) {
    return validationError("A target name is required.");
  }

  if (props.existingTargets.find((target) => target.name === tempTarget.value.name) !== undefined) {
    return validationError("A target with this name already exists.");
  }

  if (tempTarget.value.name.includes(" ")) {
    return validationError("Target name has invalid characters.");
  }

  return validationSuccess();
});

const { validationResult: portalAddressValidationResult } = validationScope.useValidator(() => {
  if (useUserSettings().value.iscsi.clusteredServer) {
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

    const targetWithExistingPortal = props.existingTargets.find((target) => target.portals.find((portal) => portal.address === (tempPortal.value.address + ":3260")));
    if (targetWithExistingPortal !== undefined) {
      return validationError(`This address is already in use by target: ${targetWithExistingPortal.name}`)
    }
  }

  return validationSuccess();
});
</script>
