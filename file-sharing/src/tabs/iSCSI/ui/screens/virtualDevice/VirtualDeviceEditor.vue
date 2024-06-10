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

            <InputLabelWrapper>
                <template #label>
                    {{ _("Block Size") }}
                </template>
                
                <InputField
                    :placeholder="'Size'"
                    :disabled="tempDevice.deviceType === DeviceType.BlockIO"
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
                    :disabled="!scopeValid || !modified"
                >{{ ("Create") }}  {{scopeValid}}</button>
            </div>
        </template>
    </CardContainer>
</template>

<script setup lang="ts">
    import { CardContainer, InputField, InputLabelWrapper, SelectMenu, useTempObjectStaging, wrapActions, type SelectMenuOption, ValidationResultView, useValidationScope, useValidator, validationSuccess, validationError } from '@45drives/houston-common-ui';
    import { err, ok, type ResultAsync } from 'neverthrow';
    import { inject, ref, type Ref } from 'vue';
    import { DeviceType, VirtualDevice } from '../../types/VirtualDevice';
    import { Command, Path, ProcessError, StringToIntCaster, getServer } from '@45drives/houston-common-lib';
    import type { ISCSIDriver } from '../../types/ISCSIDriver';

    const _ = cockpit.gettext;
    
    const emit = defineEmits(['closeEditor']);

    const deviceTypeOptions: SelectMenuOption<DeviceType>[] = Object.values(DeviceType).map(deviceType => ({label: deviceType.toString(), value: deviceType}));

    const newDevice = ref<VirtualDevice>(new VirtualDevice("", "", 512, DeviceType.FileIO));

    const { tempObject: tempDevice, modified, resetChanges } = useTempObjectStaging(newDevice);

    const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver");

    if (driver === undefined) {
		throw new Error("iSCSI Driver is null");
	}

    const virtualDevices = inject<Ref<VirtualDevice[]>>('virtualDevices');

    if (virtualDevices === undefined) {
        throw new Error("Virtual Device list is null");
    }

    const handleClose = () => {
        emit("closeEditor");
        resetChanges();
    }

    const finalizeDevice = async () => {
        if (tempDevice.value.deviceType === DeviceType.BlockIO) {
            await fetchBlockSize(tempDevice.value.filePath).map((blockSize) => {
                console.log(blockSize);
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

    const { scopeValid } = useValidationScope();

    const { validationResult: deviceNameValidationResult } = useValidator(() => {
        if (!tempDevice.value.deviceName) {
            return validationError("Device name is required.");
        }

        if (virtualDevices.value.find((device) => (device.deviceName === tempDevice.value.deviceName)) !== undefined) {
            return validationError("A device with this name already exists.");
        }

        return validationSuccess();
    });

    const { validationResult: filePathValidationResult } = useValidator(async () => {
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

    const { validationResult: blockSizeValidationResult } = useValidator(() => {
        if (!tempDevice.value.blockSize) {
            return validationError("Device Block Size is required.");
        }

        // const number = StringToIntCaster()(tempDevice.value.blockSize);

        // if (number.isNone() || number.some() < 0) {
        //     return validationError("Device Block Size needs to be a positive number.");
        // }

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
