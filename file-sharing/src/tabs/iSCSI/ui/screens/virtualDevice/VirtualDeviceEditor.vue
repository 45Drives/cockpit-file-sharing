<template> 
    <CardContainer>
        <div
            v-if="tempDevice"
            class="space-y-content"
        >
            <div class="space-y-content text-base">
                <div
                    class="text-header"
                >{{ _("New Device") }}</div>
            </div>

            <InputLabelWrapper>
                <template #label>
                    {{ _("Device Name") }}
                </template>

                <InputField
                    :placeholder="'A unique name for your device'"
                    v-model="tempDevice.deviceName"
                />
                <ValidationResultView v-bind="deviceNameValidationResult"/>
            </InputLabelWrapper>

            <InputLabelWrapper>
                <template #label>
                    {{ _("Device Type") }}
                </template>

                <SelectMenu
                    v-model="tempDevice.deviceType"
                    :options="deviceTypeOptions"
                />
            </InputLabelWrapper>

            <InputLabelWrapper>
                <template #label>
                    {{ _("File Path") }}
                </template>
                
                <InputField
                    :placeholder="'File path to device'"
                    v-model="tempDevice.filePath"
                />
                <ValidationResultView v-bind="filePathValidationResult"/>
            </InputLabelWrapper>

            <InputLabelWrapper v-if="tempDevice.deviceType !== DeviceType.BlockIO">
                <template #label>
                    {{ _("Block Size") }}
                </template>
                
                <InputField
                    :placeholder="'Size'"
                    type="number"
                    v-model="tempDevice.blockSize"
                />
                <ValidationResultView v-bind="blockSizeValidationResult"/>
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
                    @click="finalizeDevice"
                    :disabled="!validationScope.isValid()"
                >{{ ("Create") }}</button>
            </div>
        </template>
    </CardContainer>
</template>

<script setup lang="ts">
    import { CardContainer, InputField, InputLabelWrapper, SelectMenu, ToggleSwitchGroup, ToggleSwitch, useTempObjectStaging, wrapActions, type SelectMenuOption, ValidationResultView, validationSuccess, validationError, ValidationScope } from '@45drives/houston-common-ui';
    import { err, ok, type ResultAsync } from 'neverthrow';
    import { computed, inject, ref, type Ref } from 'vue';
    import { DeviceType, VirtualDevice } from '@/tabs/iSCSI/types/VirtualDevice';
    import { Command, Path, ProcessError, StringToIntCaster, getServer } from '@45drives/houston-common-lib';
    import type { ISCSIDriver } from '@/tabs/iSCSI/types/drivers/ISCSIDriver';
    import { useUserSettings } from '@/common/user-settings';
    import type { ISCSIDriverClusteredServer } from '@/tabs/iSCSI/types/drivers/ISCSIDriverClusteredServer';
    import type { Target } from '@/tabs/iSCSI/types/Target';

    const _ = cockpit.gettext;
    
    const emit = defineEmits(['closeEditor']);

    const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver")!;

    const targets = inject<Ref<Target[]>>("targets")!;

    const virtualDevices = inject<Ref<VirtualDevice[]>>('virtualDevices')!;

    const deviceTypeOptions: Ref<SelectMenuOption<DeviceType>[]> = ref([]);

    driver.map((driver) => driver.getHandledDeviceTypes()
        .map((deviceType) => ({label: deviceType.toString(), value: deviceType})))
        .map((options) => deviceTypeOptions.value = options);

    const targetOptions: Ref<SelectMenuOption<Target>[]> = computed(() =>
        targets.value.map((target) => ({ label: target.name, value: target}))
    );
    
    const newDevice = ref<VirtualDevice>(new VirtualDevice("", "", 512, DeviceType.BlockIO));

    const { tempObject: tempDevice, modified, resetChanges} = useTempObjectStaging(newDevice);

    const handleClose = () => {
        emit("closeEditor");
        resetChanges();
    }

    const finalizeDevice = async () => {
        if (tempDevice.value.deviceType === DeviceType.BlockIO) {
            await fetchBlockSize(tempDevice.value.filePath).map((blockSize) => {
                tempDevice.value.blockSize = blockSize
            })
        }

        actions.createDevice()
    }

    const createDevice = () => {
        return driver.andThen((driver) => driver.addVirtualDevice(tempDevice.value))
                        .map(() => handleClose())
                        .mapErr((error) => new ProcessError(`Unable to create device ${tempDevice.value.deviceName}: ${error.message}`))
    }

    const actions = wrapActions({createDevice});

    const validationScope = new ValidationScope();

    const { validationResult: deviceNameValidationResult } = validationScope.useValidator(() => {
        if (!tempDevice.value.deviceName) {
            return validationError("Device name is required.");
        }

        if (virtualDevices.value.find((device) => (device.deviceName === tempDevice.value.deviceName)) !== undefined) {
            return validationError("A device with this name already exists.");
        }

        return validationSuccess();
    });

    const { validationResult: filePathValidationResult } = validationScope.useValidator(async () => {
        if (!tempDevice.value.filePath) {
            return validationError("Device path is required.");
        }

        const path = new Path(tempDevice.value.filePath);

        const fileExists = await getServer()
                            .andThen((server) => path.existsOn(server))
                            .unwrapOr(false);
        
        if (!fileExists) {
            return validationError("Device path does not exist.");
        }

        return validationSuccess();
    });

    const { validationResult: blockSizeValidationResult } = validationScope.useValidator(() => {
        if (!tempDevice.value.blockSize) {
            return validationError("Device Block Size is required.");
        }

        if (tempDevice.value.blockSize < 0) {
            return validationError("Device Block Size needs to be a positive number.");
        }

        return validationSuccess();
    });

    function fetchBlockSize(filePath: string): ResultAsync<number, ProcessError> {
		return getServer().andThen((server) => {
			return server.execute(new Command(["stat", "-fc %s", filePath])).andThen((proc) => {
				const blockSize = StringToIntCaster()(proc.getStdout());

                if (blockSize.isNone()){
                    return err(new ProcessError(`Could not determine block size for disk.`))
                }
                    
                return ok(blockSize.some());
			})
		})
	}

</script>
