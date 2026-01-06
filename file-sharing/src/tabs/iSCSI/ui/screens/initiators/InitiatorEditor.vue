<template>
  <CardContainer>
    <div v-if="tempInitiator" class="space-y-content">
      <div class="space-y-content text-base">
        <div class="text-header">{{ _("New Initiator") }}</div>
      </div>

      <InputLabelWrapper>
        <template #label>
          {{ _("Name") }}
        </template>

        <InputField v-model="tempInitiator.name" />
        <ValidationResultView v-bind="initiatorNameValidationResult" />
      </InputLabelWrapper>
    </div>

    <template v-slot:footer>
      <div class="button-group-row justify-end grow">
        <button class="btn btn-secondary" @click="handleClose">{{ "Cancel" }}</button>
        <button class="btn btn-primary" @click="promptCreateInitiator"
          :disabled="!validationScope.isValid() || !modified || !canCreate">
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
  ValidationScope, confirmBeforeAction
} from "@45drives/houston-common-ui";
import type { ResultAsync } from "neverthrow";
import { computed, inject, ref, type Ref } from "vue";
import { ProcessError } from "@45drives/houston-common-lib";
import type { InitiatorGroup } from "@/tabs/iSCSI/types/InitiatorGroup";
import { Initiator } from "@/tabs/iSCSI/types/Initiator";
import type { ISCSIDriver } from "@/tabs/iSCSI/types/drivers/ISCSIDriver";
import { useUserSettings } from "@/common/user-settings";

const _ = cockpit.gettext;

const props = defineProps<{ initiatorGroup: InitiatorGroup }>();

const emit = defineEmits(["closeEditor", "created"]);

const newInitiator = ref<Initiator>(Initiator.empty());

const { tempObject: tempInitiator, modified, resetChanges } = useTempObjectStaging(newInitiator);
const canEditIscsi = inject<Ref<boolean>>("canEditIscsi");
if (!canEditIscsi) throw new Error("canEditIscsi not provided");
const canCreate = computed(() => canEditIscsi.value); const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver")!;
const handleClose = () => {
  emit("closeEditor");
  resetChanges();
};

const createConfiguration = () => {
  return driver
    .andThen((driver) => driver.addInitiatorToGroup(props.initiatorGroup, tempInitiator.value))
    .map(() => {
      emit("created")
      handleClose()
    })
    .mapErr(
      (error) =>
        new ProcessError(
          `Unable to add initiator ${tempInitiator.value.name} to group ${props.initiatorGroup.name}: ${error.message}`
        )
    );
};

const actions = wrapActions({ createConfiguration });


const creationBody = computed(() => {
  const base = `Add "${tempInitiator.value.name}" initiator to the group ${props.initiatorGroup.name}?`;

  const clusteredWarning = `
Changing iSCSI initiator group configuration can cause related targets or resources to restart and may disrupt active sessions using this target.
It is recommended to perform this action during a planned maintenance window or other downtime if it could impact production workloads.`

  const isClustered = useUserSettings().value.iscsi.clusteredServer === true;

  return isClustered ? `${base}\n\n${clusteredWarning.trim()}` : base;
});



const promptCreateInitiator = () => {
  return confirmBeforeAction(
    {
      header: _("Confirm"),
      body:
        creationBody.value,
      dangerous: true
    },
    actions.createConfiguration
  )();

}
const validationScope = new ValidationScope();

const { validationResult: initiatorNameValidationResult } = validationScope.useValidator(() => {
  if (!tempInitiator.value.name) {
    return validationError("A name is required.");
  }

  if (tempInitiator.value.name.includes(" ")) {
    return validationError("Initiator name has invalid characters.");
  }

  return validationSuccess();
});
</script>
