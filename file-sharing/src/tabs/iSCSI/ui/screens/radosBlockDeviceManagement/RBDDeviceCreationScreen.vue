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
        <p v-if="alignedSize !== undefined" class="text-sm text-muted">
          {{ _(`This size cannot be divided evenly across ${tempDeviceOptions.numberOfRBDs} RBDs, so the device will be rounded up to ${alignedSizeText}.`) }}
        </p>
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
          :disabled="!validationScope.isValid() || !modified || !canCreate"
        >
          {{ "Create" }}
        </button>
      </div>
    </template>
  </CardContainer>
</template>

<script setup lang="ts">
import { Pool } from "@/tabs/iSCSI/types/cluster/Pool";
import type { ISCSIDriverClusteredServer } from "@/tabs/iSCSI/types/drivers/ISCSIDriverClusteredServer";
import { VirtualDevice } from "@/tabs/iSCSI/types/VirtualDevice";
import { formatBytes, type ProcessError } from "@45drives/houston-common-lib";
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
  ByteInput,
} from "@45drives/houston-common-ui";
import { ok, ResultAsync, safeTry } from "neverthrow";
import { computed, inject, ref, type Ref } from "vue";

const _ = cockpit.gettext;

const emit = defineEmits<{
  (e: "close"): void;
  (e: "created", value: VirtualDevice): void;
}>();

const driver = inject<ResultAsync<ISCSIDriverClusteredServer, ProcessError>>("iSCSIDriver")!;
  const canEditIscsi = inject<Ref<boolean>>("canEditIscsi");
  if (!canEditIscsi) throw new Error("canEditIscsi not provided");
  const canCreate = computed(() => canEditIscsi.value);
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

// A striped logical volume has to use the same whole number of extents on every
// stripe, so a requested size that does not divide evenly is rounded *up* -
// rounding down would hand back less capacity than was asked for. Show the size
// that will actually be created so the difference is not a surprise afterwards.
//
// The real extent size is read from the volume group at creation time; the group
// does not exist yet here, so this preview assumes the LVM default of 4 MiB. It
// is display only - the authoritative arithmetic lives in RBDManager.
const extentSize = 4 * 1024 ** 2;

const alignedSize = computed(() => {
  const requested = tempDeviceOptions.value.maximumSize;
  const stripeCount = tempDeviceOptions.value.numberOfRBDs;

  if (requested === undefined || requested <= 0 || stripeCount <= 0) {
    return undefined;
  }

  const aligned = Math.ceil(requested / stripeCount / extentSize) * extentSize * stripeCount;

  return aligned === requested ? undefined : aligned;
});

// `formatBytes` rounds to four significant digits, which would render an 11.004
// GiB result as "11.00 GiB" - indistinguishable from the 11 GiB that was typed,
// making the message look like it is saying nothing. Show enough decimals for
// the difference to be visible.
const alignedSizeText = computed(() => {
  const aligned = alignedSize.value;

  if (aligned === undefined) {
    return "";
  }

  const gib = aligned / 1024 ** 3;

  return gib >= 1 ? `${Number(gib.toFixed(3))} GiB` : `${Number((aligned / 1024 ** 2).toFixed(3))} MiB`;
});

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

        const sizePerRBD = Math.ceil(tempDeviceOptions.value.maximumSize!/tempDeviceOptions.value.numberOfRBDs);

        for (let i = 0; i < tempDeviceOptions.value.numberOfRBDs; i++) {
          const result = yield * rbdManager.createRadosBlockDevice(
            `${tempDeviceOptions.value.name!}_RBD_${i+1}`,
            sizePerRBD,
            tempDeviceOptions.value.parentPool!,
            tempDeviceOptions.value.dataPool
          ).safeUnwrap();

          createdRBDs.push(result);
        }

        return ok(yield * rbdManager.createLogicalVolumeFromRadosBlockDevices(tempDeviceOptions.value.name!, `${tempDeviceOptions.value.name!}_VG`, createdRBDs, tempDeviceOptions.value.maximumSize).safeUnwrap());
      }))
      .map((logicalVolume) => {
        emit('created', logicalVolume);
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
