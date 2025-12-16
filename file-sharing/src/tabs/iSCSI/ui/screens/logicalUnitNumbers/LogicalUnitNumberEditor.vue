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
        :disabled="!validationScope.isValid() || !canCreate"
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
import { computed, inject, ref, toRaw, type ComputedRef, type Ref } from "vue";
import { ISCSIDriver } from "../../../types/drivers/ISCSIDriver";
import type { InitiatorGroup } from "../../../types/InitiatorGroup";
import { LogicalUnitNumber } from "../../../types/LogicalUnitNumber";
import { VirtualDevice } from "../../../types/VirtualDevice";
import { Maybe } from "monet";

const _ = cockpit.gettext;

const props = defineProps<{ initiatorGroup: InitiatorGroup }>();

const emit = defineEmits(["closeEditor","created"]);

defineExpose({populateNextNumber})

const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver")!;

const devices = inject<Ref<VirtualDevice[]>>("virtualDevices")!;
  const canEditIscsi = inject<Ref<boolean>>("canEditIscsi");
  if (!canEditIscsi) throw new Error("canEditIscsi not provided");
  const canCreate = computed(() => canEditIscsi.value);
  
const deviceOptions: ComputedRef<SelectMenuOption<string>[]> = computed(() =>
  devices.value.filter((device) => !device.vgName && !device.assigned && !props.initiatorGroup.logicalUnitNumbers.find((lun) => lun.blockDevice === device)).map((device) => ({ label: device.deviceName, value: device.deviceName }))
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
  const dev = devices.value.find(d => d.deviceName === tempLun.value.name);
  if (!dev) {
    return Result.err(new ProcessError(`Device ${tempLun.value.name} not found`));
  }
  dev.assigned = true;

  const payload = {
    ...toRaw(tempLun.value),
    blockDevice: toRaw(dev),
  };

  return driver
  .andThen(d => d.addLogicalUnitNumberToGroup(props.initiatorGroup, payload))
  .map((pinnedNode ) => {
    console.log("execServer:", pinnedNode);
    if(pinnedNode){
      dev.server = pinnedNode;
    }
    console.log("dev server", dev.server)
  })
  
  .mapErr(error => new ProcessError(
    `Unable to add LUN to group ${props.initiatorGroup.name}: ${error.message}`
  ))
  .andThen(() =>
      driver.andThen(d => d.getnode())
      )
      .map(() => {
        emit("created")
        handleClose();
})
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
