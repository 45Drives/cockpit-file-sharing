<template>
  <CardContainer>
    <div class="space-y-content">
      <div class="space-y-content text-base">
        <div class="text-header">{{ _(`${device.deviceName} (${formatBytes(device.maximumSize ?? 0, "binary")})`) }}</div>
      </div>
    
      <InputLabelWrapper>
        <template #label>
          {{ _("New Size") }}
        </template>

        <div class="min-w-40 inline-flex flex-row space-x-1">
          <InputField v-model="sizeAmount" type="number" />
          <SelectMenu v-model="sizeUnitExponent" :options="sizeUnitOptions" />
        </div>
        <p v-if="alignedSize !== undefined" class="text-sm text-muted">
          {{ _(`This size cannot be divided evenly across the ${stripeCount} RBDs backing this device, so it will be rounded up to ${alignedSizeText}.`) }}
        </p>
        <ValidationResultView v-bind="sizeValidationResult" />
      </InputLabelWrapper>
    </div>

      <template v-slot:footer>
        <div class="button-group-row justify-end grow">
          <button class="btn btn-secondary" @click="emit('close')">{{ "Cancel" }}</button>
          <button
            class="btn btn-primary"
            @click="actions.resizeDevice"
            :disabled="!validationScope.isValid() || !modified || !canCreate"
          >
            {{ "Create" }}
          </button>
        </div>
      </template>
  </CardContainer>
</template>

<script setup lang="ts">
import { RadosBlockDevice } from "@/tabs/iSCSI/types/cluster/RadosBlockDevice";
import { LogicalVolume } from "@/tabs/iSCSI/types/cluster/LogicalVolume";
import { CardContainer, InputField, InputLabelWrapper, SelectMenu, type SelectMenuOption, useTempObjectStaging, validationError, ValidationResultView, ValidationScope, validationSuccess, wrapActions } from "@45drives/houston-common-ui";
import { ResultAsync, okAsync, errAsync } from "neverthrow";
import { computed, inject, ref, watch, type Ref } from "vue";
import type { ISCSIDriverClusteredServer } from "@/tabs/iSCSI/types/drivers/ISCSIDriverClusteredServer";
import { ProcessError, formatBytes } from "@45drives/houston-common-lib";
import type { VirtualDevice } from "@/tabs/iSCSI/types/VirtualDevice";

const _cockpit = cockpit;

const _ = cockpit.gettext;

const driver = inject<ResultAsync<ISCSIDriverClusteredServer, ProcessError>>("iSCSIDriver")!;
  const canEditIscsi = inject<Ref<boolean>>("canEditIscsi");
  if (!canEditIscsi) throw new Error("canEditIscsi not provided");
  const canCreate = computed(() => canEditIscsi.value);
  const props = defineProps<{
  device: RadosBlockDevice | LogicalVolume | VirtualDevice;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

/**
 * Parses an LVM device path of the form `/dev/<vg>/<lv>` into its components.
 * Returns undefined for anything that is not an LVM path.
 */
const parseLvmPath = (filePath?: string) => {
  const match = /^\/dev\/([^/]+)\/([^/]+)$/.exec(filePath ?? "");
  if (!match) return undefined;
  return { vgName: match[1]!, lvName: match[2]! };
};

const resizeDevice = () => {
  const newSize = tempOptions.value.maximumSize;
  if (newSize === undefined) {
    return okAsync(undefined);
  }

  return driver.andThen((d) => {
    const device = props.device;

    const syncSize = (resized: LogicalVolume | RadosBlockDevice) => {
      if (resized.maximumSize !== undefined) {
        device.maximumSize = resized.maximumSize;
      }
      newOptions.value.maximumSize = device.maximumSize;
      resetChanges();
    };

    // Fast path: we already hold a real LogicalVolume instance.
    if (device instanceof LogicalVolume) {
      return d.rbdManager
        .expandLogicalVolume(device, newSize)
        .map(() => syncSize(device))
        .map(() => emit("close"))
        .map(() => undefined);
    }

    const lvmPath = parseLvmPath(device.filePath);
    if (lvmPath) {
      const server = device.server ?? d.rbdManager.getPrimaryServer();
      return d
        .resolveLogicalVolume(lvmPath.vgName, lvmPath.lvName, server)
        .andThen((logicalVolume) =>
          d.rbdManager
            .expandLogicalVolume(logicalVolume, newSize)
            .map(() => syncSize(logicalVolume))
        )
        .map(() => emit("close"))
        .map(() => undefined);
    }

    // Genuine Rados Block Device.
    if (device instanceof RadosBlockDevice) {
      return d.rbdManager
        .expandRadosBlockDevice(device, newSize)
        .map(() => {
          device.maximumSize = newSize;
          syncSize(device);
        })
        .map(() => emit("close"))
        .map(() => undefined);
    }

    // Refuse to guess: issuing `rbd resize` against an unknown device risks
    // targeting the wrong image.
    return errAsync(
      new ProcessError(
        `Unable to resize "${device.deviceName}": could not determine whether it is a logical volume or a Rados Block Device.`
      )
    );
  });
};

interface Options {
  maximumSize: number | undefined;
}

const newOptions = ref<Options>({
  maximumSize: props.device.maximumSize,
});

const { tempObject: tempOptions, modified, resetChanges } = useTempObjectStaging(newOptions);

const sizeUnitOptions: SelectMenuOption<number>[] = [
  { label: "MiB", value: 2 },
  { label: "GiB", value: 3 },
  { label: "TiB", value: 4 },
];

const sizeUnitExponent = ref(3); // default to GiB

const sizeAmount = ref(
  props.device.maximumSize === undefined ? "" : `${props.device.maximumSize / 1024 ** 3}`
);

watch([sizeAmount, sizeUnitExponent], ([amount, exponent]) => {
  const parsed = Number(amount);

  tempOptions.value.maximumSize =
    amount.trim() === "" || !Number.isFinite(parsed)
      ? undefined
      : Math.round(parsed * 1024 ** exponent);
});

const actions = wrapActions({resizeDevice});

// A striped logical volume has to grow by whole extents on every stripe, so a
// requested size that does not divide evenly is rounded *up* - rounding down
// would leave the volume smaller than asked for. Show what the size will
// actually become rather than letting the difference appear only afterwards.
//
// Display only: the authoritative arithmetic in RBDManager reads the real extent
// size from the volume group, whereas this preview assumes the 4 MiB default.
const extentSize = 4 * 1024 ** 2;

const stripeCount = computed(() =>
  props.device instanceof LogicalVolume ? props.device.volumeGroup.volumes.length : 1
);

const alignedSize = computed(() => {
  const requested = tempOptions.value.maximumSize;
  const stripes = stripeCount.value;

  if (requested === undefined || requested <= 0 || stripes <= 0) {
    return undefined;
  }

  const aligned = Math.ceil(requested / stripes / extentSize) * extentSize * stripes;

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

const validationScope = new ValidationScope();

const { validationResult: sizeValidationResult } = validationScope.useValidator(() => {
  if (tempOptions.value.maximumSize === undefined)
    return validationError("A new larger size needs to be entered.");

  if (tempOptions.value.maximumSize <= props.device.maximumSize)
    return validationError("The new size needs to be larger than the current size.");

  return validationSuccess();
});

</script>
  