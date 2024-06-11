<template> 
    <CardContainer>
        <div
            v-if="tempLun"
            class="space-y-content"
        >
            <div class="space-y-content text-base">
                <div
                    class="text-header"
                >{{ _("New LUN") }}</div>
            </div>

            <InputLabelWrapper>
                <template #label>
                    {{ _("Unit Number") }}
                </template>

                <InputField
                    :placeholder="'0'"
                    type="number"
                    v-model="tempLun.unitNumber"
                />
                <ValidationResultView v-bind="numberValidationResult" />
            </InputLabelWrapper>

            <InputLabelWrapper>
                <template #label>
                    {{ _("Device") }}
                </template>

                <SelectMenu
                    v-model="tempLun.name"
                    :options="deviceOptions"
                />
                <ValidationResultView v-bind="deviceValidationResult" />
            </InputLabelWrapper>
        </div>

        <template v-slot:footer>
            <div class="button-group-row justify-end grow">
                <button
                    class="btn btn-secondary"
                    @click="handleClose"
                >{{ ("Cancel") }}</button>
                <button
                    class="btn btn-primary"
                    @click="actions.createLun"
                    :disabled="!validationScope.isValid()"
                >{{ ("Create") }} {{ tempLun.blockDevice?.deviceName }}</button>
            </div>
        </template>
    </CardContainer>
</template>

<script setup lang="ts">
    import { CardContainer, InputField, InputLabelWrapper, SelectMenu, useTempObjectStaging, validationError, validationSuccess, ValidationResultView, wrapActions, type SelectMenuOption, ValidationScope } from '@45drives/houston-common-ui';
    import type { ResultAsync } from 'neverthrow';
    import { computed, inject, ref, type ComputedRef, type Ref } from 'vue';
    import { ProcessError, StringToIntCaster } from '@45drives/houston-common-lib';
    import type { ISCSIDriver } from '../../types/ISCSIDriver';
    import type { InitiatorGroup } from '../../types/InitiatorGroup';
    import { LogicalUnitNumber } from '../../types/LogicalUnitNumber';
    import { VirtualDevice } from '../../types/VirtualDevice';

    const _ = cockpit.gettext;

    const props = defineProps<{initiatorGroup: InitiatorGroup}>();

    const emit = defineEmits(['closeEditor']);

    const newLun = ref<LogicalUnitNumber>(LogicalUnitNumber.empty());

    const { tempObject: tempLun, modified, resetChanges } = useTempObjectStaging(newLun);

    const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver");

    if (driver === undefined) {
		throw new Error("iSCSI Driver is null");
	}

    const devices = inject<Ref<VirtualDevice[]>>('virtualDevices');

    if (devices === undefined) {
        throw new Error("Virtual Device list is null");
    }

    const deviceOptions: ComputedRef<SelectMenuOption<string>[]> = computed(() => devices.value.map(device => ({label: device.deviceName, value: device.deviceName})))

    const handleClose = () => {
        emit("closeEditor");
        resetChanges();
    }

    const createLun = () => {
        return driver.andThen((driver) => driver.addLogicalUnitNumberToGroup(props.initiatorGroup, tempLun.value))
                        .map(() => handleClose())
                        .mapErr((error) => new ProcessError(`Unable to add LUN to group ${props.initiatorGroup.name}: ${error.message}`))
    }

    const validationScope = new ValidationScope();

    const { validationResult: numberValidationResult } = validationScope.useValidator(() => {
        if (!tempLun.value.unitNumber) {
            return validationError("A Logical Unit Number is required.");
        }

        if (tempLun.value.unitNumber < 0) {
            return validationError("The Logical Unit Number to be a positive number.");
        }

        return validationSuccess();
    });

    const { validationResult: deviceValidationResult } = validationScope.useValidator(() => {
        if (!tempLun.value.blockDevice === undefined) {
            return validationError("A device is required.");
        }

        return validationSuccess();
    });

    const actions = wrapActions({createLun});

</script>
