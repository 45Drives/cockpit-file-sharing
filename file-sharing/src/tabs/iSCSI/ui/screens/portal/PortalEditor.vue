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
          @click="actions.createPortal"
          :disabled="!validationScope.isValid() || !modified"
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
  ValidationScope,
} from "@45drives/houston-common-ui";
import type { ResultAsync } from "neverthrow";
import { inject, ref } from "vue";
import { ProcessError } from "@45drives/houston-common-lib";
import type { Target } from "@/tabs/iSCSI/types/Target";
import type { ISCSIDriver } from "@/tabs/iSCSI/types/drivers/ISCSIDriver";
import { Portal } from "@/tabs/iSCSI/types/Portal";

const _ = cockpit.gettext;

const props = defineProps<{ target: Target }>();

const emit = defineEmits(["closeEditor"]);

const newPortal = ref<Portal>(new Portal(""));

const { tempObject: tempPortal, modified, resetChanges } = useTempObjectStaging(newPortal);

const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver");

if (driver === undefined) {
  throw new Error("iSCSI Driver is null");
}

const handleClose = () => {
  emit("closeEditor");
  resetChanges();
};

const createPortal = () => {
  tempPortal.value.address += ":3260";

  return driver
    .andThen((driver) => driver.addPortalToTarget(props.target, tempPortal.value))
    .map(() => handleClose())
    .mapErr(
      (error) =>
        new ProcessError(`Unable to create portal ${tempPortal.value.address}: ${error.message}`)
    );
};

const actions = wrapActions({ createPortal });

const validationScope = new ValidationScope();

const { validationResult: portalAddressValidationResult } = validationScope.useValidator(() => {
  if (!tempPortal.value.address) {
    return validationError("A portal address is required.");
  }

  if (tempPortal.value.address.includes(":")) {
    return validationError("The port defaults to 3260.");
  }

  return validationSuccess();
});
</script>
