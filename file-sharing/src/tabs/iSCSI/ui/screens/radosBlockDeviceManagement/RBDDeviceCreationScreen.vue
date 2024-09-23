<template>
  <CardContainer class="overflow-y-scroll">
    <div class="space-y-content">
      <div class="space-y-content text-base">
        <div class="text-header">{{ _("New Device") }}</div>
      </div>

      <InputLabelWrapper>
        <template #label>
          {{ _("Device Name") }}
        </template>

        <InputField :placeholder="'Name of LV'" v-model="tempDeviceOptions.name" />
        <ValidationResultView v-bind="nameValidationResult" />
      </InputLabelWrapper>

      <InputLabelWrapper>
        <template #label>
          {{ _("Pool") }}
        </template>

        <SelectMenu
          v-model="tempDeviceOptions.parentPool"
          :options="avaliablePools"
          :placeholder="'-'"
        />
        <ValidationResultView v-bind="poolValidationResult" />
      </InputLabelWrapper>

      <InputLabelWrapper>
        <template #label>
          {{ _("Data Pool") }}
        </template>

        <SelectMenu
          v-model="tempDeviceOptions.dataPool"
          :options="avaliablePools"
          :placeholder="'-'"
        />
        <ValidationResultView v-bind="dataPoolValidationResult" />
      </InputLabelWrapper>

      <InputLabelWrapper>
        <template #label>
          {{ _("Total Size") }}
        </template>

        <ByteInput v-model="tempDeviceOptions.maximumSize"/>
        <ValidationResultView v-bind="sizeValidationResult" />
      </InputLabelWrapper>

      <InputLabelWrapper>
        <template #label>
          {{ _("Number of RBDs to Split Across") }}
        </template>

        <InputField type="number" v-model="tempDeviceOptions.numberOfRBDs" />
        <ValidationResultView v-bind="rbdAmountValidationResult" />
      </InputLabelWrapper>
    </div>

    <template v-slot:footer>
      <div class="button-group-row justify-end grow">
        <button class="btn btn-secondary" @click="emit('close')">{{ "Cancel" }}</button>
        <button
          class="btn btn-primary"
          @click="actions.createDevice"
          :disabled="!validationScope.isValid() || !modified"
        >
          {{ "Create" }}
        </button>
      </div>
    </template>
  </CardContainer>
</template>

<script setup lang="ts">
import ByteInput from "@45drives/houston-common/houston-common-ui/lib/components/ByteInput.vue";
import { Pool } from "@/tabs/iSCSI/types/cluster/Pool";
import type { ISCSIDriverClusteredServer } from "@/tabs/iSCSI/types/drivers/ISCSIDriverClusteredServer";
import type { ProcessError } from "@45drives/houston-common-lib";
import {
  CardContainer,
  SelectMenu,
  InputLabelWrapper,
  useTempObjectStaging,
  InputField,
  type SelectMenuOption,
  ValidationScope,
  ValidationResultView,
  validationSuccess,
  validationError,
  wrapActions,
} from "@45drives/houston-common-ui";
import { ok, ResultAsync, safeTry } from "neverthrow";
import { inject, ref, type Ref } from "vue";

const _ = cockpit.gettext;

const emit = defineEmits<{
  (e: "close"): void;
  (e: "update"): void;
}>();

const driver = inject<ResultAsync<ISCSIDriverClusteredServer, ProcessError>>("iSCSIDriver")!;

interface DeviceOptions {
  parentPool: Pool | undefined;
  dataPool: Pool | undefined;
  maximumSize: number | undefined;
  numberOfRBDs: number;
  name: string | undefined;
}

let existingImages: string[] = [];

driver.map((driver) => driver.rbdManager.fetchExistingImageNames().map((images) => existingImages = images));

const avaliablePools: Ref<SelectMenuOption<undefined | Pool>[]> = ref([]);

const newOptions = ref<DeviceOptions>({
  parentPool: undefined,
  dataPool: undefined,
  maximumSize: undefined,
  numberOfRBDs: 0,
  name: undefined,
});

const { tempObject: tempDeviceOptions, modified, resetChanges } = useTempObjectStaging(newOptions);

driver
  .andThen((driver) => driver.rbdManager.fetchAvaliablePools())
  .map((pools) => pools.map((pool) => ({ label: pool.name, value: pool })))
  .map((options) => {
    avaliablePools.value = [{ label: "-", value: undefined }, ...options];
  });

const createDevice = () => {
  return driver
    .map((driver) => driver.rbdManager)
    .andThen((rbdManager) => {
      return new ResultAsync(safeTry(async function * () {
        let createdRBDs = [];

        const sizePerRBD = Math.round(tempDeviceOptions.value.maximumSize!/tempDeviceOptions.value.numberOfRBDs);

        for (let i = 0; i < tempDeviceOptions.value.numberOfRBDs; i++) {
          const result = yield * rbdManager.createRadosBlockDevice(
            `${tempDeviceOptions.value.name!}_RBD_${i+1}`,
            sizePerRBD,
            tempDeviceOptions.value.parentPool!,
            tempDeviceOptions.value.dataPool
          ).safeUnwrap();

          createdRBDs.push(result);
        }

        return ok(yield * rbdManager.createLogicalVolumeFromRadosBlockDevices(tempDeviceOptions.value.name!, `${tempDeviceOptions.value.name!}_VG`, createdRBDs).safeUnwrap());
      }))
      .map(() => {
        emit('update');
        resetChanges();
      });
    })
};

const actions = wrapActions({createDevice});

const validationScope = new ValidationScope();

const { validationResult: nameValidationResult } = validationScope.useValidator(() => {
  if (tempDeviceOptions.value.name === undefined || tempDeviceOptions.value.name.length === 0)
    return validationError("A name needs to be defined for the Device.");

  if (tempDeviceOptions.value.name.includes(" ")) 
    return validationError("The name has invalid characters.");

  for (let i = 1; i <= tempDeviceOptions.value.numberOfRBDs; i++) {
    if (existingImages.includes(`${tempDeviceOptions.value.name}_RBD_${i}`))
      return validationError(`An image with the name ${tempDeviceOptions.value.name}_RBD_${i} already exists.`)
  }

  return validationSuccess();
});

const { validationResult: poolValidationResult } = validationScope.useValidator(() => {
  if (tempDeviceOptions.value.parentPool === undefined)
    return validationError("A pool needs to be selected.");

  return validationSuccess();
});

const { validationResult: dataPoolValidationResult } = validationScope.useValidator(() => {
  return validationSuccess();
});

const { validationResult: rbdAmountValidationResult } = validationScope.useValidator(() => {
  if (tempDeviceOptions.value.numberOfRBDs <= 0)
    return validationError("At least one RBD is required.");

  return validationSuccess();
});

const { validationResult: sizeValidationResult } = validationScope.useValidator(() => {
  if (tempDeviceOptions.value.maximumSize === undefined)
    return validationError("A valid size is required.");

  if (tempDeviceOptions.value.maximumSize < 0)
    return validationError("Size cannot be negative.");

  return validationSuccess();
});
</script>
