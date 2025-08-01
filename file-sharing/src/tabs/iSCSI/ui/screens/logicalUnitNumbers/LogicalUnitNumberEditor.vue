<template>
  <CardContainer>
    <div v-if="tempLun" class="space-y-content">
      <div class="space-y-content text-base">
        <div class="text-header">{{ _("New LUN") }}</div>
      </div>

      <InputLabelWrapper>
        <template #label>
          {{ _("Unit Number") }}
        </template>

        <InputField type="number" v-model="unitNumberInput" />
        <ValidationResultView v-bind="numberValidationResult" />
      </InputLabelWrapper>

      <InputLabelWrapper>
        <template #label>
          {{ _("Device") }}
        </template>

        <SelectMenu v-model="tempLun.name" :options="deviceOptions" />
        <ValidationResultView v-bind="deviceValidationResult" />
      </InputLabelWrapper>
    </div>

    <template v-slot:footer>
      <div class="button-group-row justify-end grow">
        <button class="btn btn-secondary" @click="handleClose">{{ "Cancel" }}</button>
        <button
          class="btn btn-primary"
          @click="actions.createLun"
          :disabled="!validationScope.isValid()"
        >
          {{ "Create" }}
        </button>
      </div>
    </template>
  </CardContainer>
</template>

<script setup lang="ts">
import { ProcessError, StringToIntCaster } from "@45drives/houston-common-lib";
import {
  CardContainer,
  InputField,
  InputLabelWrapper,
  SelectMenu,
  useTempObjectStaging,
  validationError,
  ValidationResultView,
  ValidationScope,
  validationSuccess,
  wrapActions,
  type SelectMenuOption
} from "@45drives/houston-common-ui";
import type { ResultAsync } from "neverthrow";
import { computed, inject, ref, type ComputedRef, type Ref } from "vue";
import type { ISCSIDriver } from "../../../types/drivers/ISCSIDriver";
import type { InitiatorGroup } from "../../../types/InitiatorGroup";
import { LogicalUnitNumber } from "../../../types/LogicalUnitNumber";
import { VirtualDevice } from "../../../types/VirtualDevice";
import { Maybe } from "monet";

const _ = cockpit.gettext;

const props = defineProps<{ initiatorGroup: InitiatorGroup }>();

const emit = defineEmits(["closeEditor"]);

defineExpose({populateNextNumber})

const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver")!;

const devices = inject<Ref<VirtualDevice[]>>("virtualDevices")!;

const deviceOptions: ComputedRef<SelectMenuOption<string>[]> = computed(() =>
  devices.value.filter((device) => !device.vgName && !props.initiatorGroup.logicalUnitNumbers.find((lun) => lun.blockDevice === device)).map((device) => ({ label: device.deviceName, value: device.deviceName }))
);

const newLun = ref<LogicalUnitNumber>(LogicalUnitNumber.empty());

const { tempObject: tempLun, modified: lunModified, resetChanges: resetChangesLun } = useTempObjectStaging(newLun);
populateNextNumber();

const unitNumberInput = computed<string>({
  get: () =>
    Maybe.fromUndefined(tempLun.value.unitNumber)
      .cata(
        () => "",
        (unitNumberInput) => unitNumberInput.toString()
      ),
  set: (newUnitNumber) =>
    Maybe.fromEmpty(newUnitNumber)
      .flatMap(StringToIntCaster())
      .cata(
        () => tempLun.value.unitNumber = 0,
        (value) => tempLun.value.unitNumber = value,
      )
});

const handleClose = () => {
  emit("closeEditor");
  resetChangesLun();
};

const createLun = () => {
  tempLun.value.blockDevice = devices.value.find((device) => device.deviceName === tempLun.value.name);
  const device = devices.value.find(d => d.deviceName === tempLun.value.name);
if (device) device.assigned = true;

  return driver
    .andThen((driver) => driver.addLogicalUnitNumberToGroup(props.initiatorGroup, tempLun.value))
    .map(() => handleClose())
    .mapErr(
      (error) =>
        new ProcessError(
          `Unable to add LUN to group ${props.initiatorGroup.name}: ${error.message}`
        )
    );
};

function populateNextNumber() {
  let nextNumber = 0;

  const existingNumbers = props.initiatorGroup.logicalUnitNumbers.map((lun) => lun.unitNumber);
  
  while (existingNumbers.includes(nextNumber)) {
    nextNumber += 1;
  }

  tempLun.value.unitNumber = nextNumber;
}

const validationScope = new ValidationScope();

const { validationResult: numberValidationResult } = validationScope.useValidator(() => {
  if (!tempLun.value.unitNumber && tempLun.value.unitNumber !== 0) {
    return validationError("A Logical Unit Number is required.");
  }

  if (tempLun.value.unitNumber < 0) {
    return validationError("The Logical Unit Number to be a positive number.");
  }

  const existingNumbers = props.initiatorGroup.logicalUnitNumbers.map((lun) => lun.unitNumber);

  if (existingNumbers.includes(tempLun.value.unitNumber as number)) {
    return validationError("This Unit Number is already assigned.");
  }

  return validationSuccess();
});

const { validationResult: deviceValidationResult } = validationScope.useValidator(() => {
  if (!tempLun.value.blockDevice === undefined) {
    return validationError("A device is required.");
  }

  return validationSuccess();
});

const actions = wrapActions({ createLun });
</script>
