<template> 
    <CardContainer>
        <div
            v-if="tempDevice"
            class="space-y-content"
        >
            <div class="space-y-content text-base">
                <div
                    class="text-header"
                >New Device</div>
            </div>

            <div>
                <InputField
                        :placeholder="'A unique name for your device'"
                        :validator="deviceNameValidator"
                        v-model="tempDevice.deviceName"
                    >
                    {{ ("Device Name") }}
                </InputField>
            </div>

            <div>
                <SelectMenu
                        v-model="tempDevice.deviceType"
                        :options="deviceTypeOptions"
                    >
                    {{ ("Device Type") }}
                </SelectMenu>
            </div>

            <div>
                <InputField
                        :placeholder="'File path to device'"
                        :validator="devicePathValidator"
                        v-model="tempDevice.filePath"
                    >
                    {{ ("File Path") }}
                </InputField>
            </div>

            <div>
                <InputField
                        :placeholder="'Size'"
                        :validator="deviceBlockSizeValidator"
                        v-model="tempDevice.blockSize"
                    >
                    {{ ("Block Size") }}
                </InputField>
            </div>
        </div>

        <template v-slot:footer>
            <div class="button-group-row justify-end grow">
                <button
                    class="btn btn-secondary"
                    @click="handleClose"
                >{{ ("Cancel") }}</button>
                <button
                    class="btn btn-primary"
                    @click="actions.createDevice"
                    :disabled="!modified"
                >{{ ("Create") }}</button>
            </div>
        </template>
    </CardContainer>
</template>

<script setup lang="ts">
import { CardContainer, InputField, SelectMenu, useTempObjectStaging, wrapActions, type SelectMenuOption, type InputValidator } from '@45drives/houston-common-ui';
import type { ResultAsync } from 'neverthrow';
import { inject, ref } from 'vue';
import { DeviceType, VirtualDevice } from '../../types/VirtualDevice';
import { Path, ProcessError, StringToIntCaster, getServer } from '@45drives/houston-common-lib';
import type { ISCSIDriver } from '../../types/ISCSIDriver';

    const props = defineProps<{existingDevices: VirtualDevice[]}>();

    const emit = defineEmits(['closeEditor']);

    const deviceTypeOptions: SelectMenuOption<DeviceType>[] = Object.values(DeviceType).map(deviceType => ({label: deviceType.toString(), value: deviceType}));

    const newDevice = ref<VirtualDevice>(new VirtualDevice("", "", 512, DeviceType.FileIO));

    const { tempObject: tempDevice, modified, resetChanges } = useTempObjectStaging(newDevice);

    const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver");

    if (driver === undefined) {
		throw new Error("iSCSI Driver is null");
	}

    const handleClose = () => {
        emit("closeEditor");
        resetChanges();
    }

    const createDevice = () => {
        return driver.andThen((driver) => driver.addVirtualDevice(tempDevice.value))
                        .map(() => handleClose())
                        .mapErr((error) => new ProcessError(`Unable to create device ${tempDevice.value.deviceName}: ${error.message}`))
    }

    const actions = wrapActions({createDevice});

    const deviceNameValidator: InputValidator = (name: string) => {
        if (!name) {
            return {
                type: "error",
                message: ("Device name is required."),
            }
        }

        if (props.existingDevices.find((device) => (device.deviceName === name)) !== undefined) {
            return {
                type: "error",
                message: ("A device with this name already exists."),
            }
        }

        return;
    }

    const devicePathValidator: InputValidator = async (pathString: string) => {
        if (!pathString) {
            return {
                type: "error",
                message: ("Device path is required."),
            }
        }

        const path = new Path(pathString);

        const fileExists = await getServer()
                            .andThen((server) => path.existsOn(server))
                            .unwrapOr(false);

        if (!fileExists) {
            return {
                type: "error",
                message: ("Device path does not exist."),
            }
        }
        
        return;
    }

    const deviceBlockSizeValidator: InputValidator = (size: string) => {
        if (!size) {
            return {
                type: "error",
                message: ("Device Block Size is required."),
            }
        }

        const number = StringToIntCaster()(size);
        if (number.isNone() || number.some() < 0) {
            return {
                type: "error",
                message: ("Device Block Size needs to be a positive number."),
            }
        }
        
        return;
    }

</script>
