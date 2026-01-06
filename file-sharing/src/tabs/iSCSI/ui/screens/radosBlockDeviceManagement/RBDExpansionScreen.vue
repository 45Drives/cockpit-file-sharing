<template>
  <CardContainer>
    <div class="space-y-content">
      <div class="space-y-content text-base">
        <div class="text-header">{{ _(`${device.deviceName} (${_cockpit.format_bytes(device.maximumSize)})`) }}</div>
      </div>
    
      <InputLabelWrapper>
        <template #label>
          {{ _("New Size") }}
        </template>

        <ByteInput v-model="tempOptions.maximumSize"/>
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
import { CardContainer, InputLabelWrapper, useTempObjectStaging, validationError, ValidationResultView, ValidationScope, validationSuccess, wrapActions, ByteInput } from "@45drives/houston-common-ui";
import { ResultAsync, okAsync } from "neverthrow";
import { computed, inject, ref, type Ref } from "vue";
import type { ISCSIDriverClusteredServer } from "@/tabs/iSCSI/types/drivers/ISCSIDriverClusteredServer";
import type { ProcessError } from "@45drives/houston-common-lib";
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

const resizeDevice = () => {
  if (tempOptions.value.maximumSize !== undefined) {
    return driver.map((driver) => driver.rbdManager)
    .andThen((rbdManager) => {
      if (props.device instanceof LogicalVolume) {
        return rbdManager.expandLogicalVolume(props.device, tempOptions.value.maximumSize!)
        .map(() => emit('close'))
        .map(() => undefined);
      }
      else {
        return rbdManager.expandRadosBlockDevice(props.device, tempOptions.value.maximumSize!)
        .map(() => emit('close'))
        .map(() => undefined);
      }
    })
  }

  return okAsync(undefined);
};

interface Options {
  maximumSize: number | undefined;
}

const newOptions = ref<Options>({
  maximumSize: props.device.maximumSize,
});

const { tempObject: tempOptions, modified, resetChanges } = useTempObjectStaging(newOptions);

const actions = wrapActions({resizeDevice});

const validationScope = new ValidationScope();

const { validationResult: sizeValidationResult } = validationScope.useValidator(() => {
  if (tempOptions.value.maximumSize === undefined)
    return validationError("A new larger size needs to be entered.");

  if (tempOptions.value.maximumSize <= props.device.maximumSize)
    return validationError("The new size needs to be larger than the current size.");

  return validationSuccess();
});

</script>
  