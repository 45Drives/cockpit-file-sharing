<template>
    <CardContainer>
        <template v-slot:header>
            Devices
        </template>
        <div class="overflow-hidden"
            :style="{ 'max-height': showAddDevice ? '1500px' : '0', transition: showAddDevice ? 'max-height 0.5s ease-in' : 'max-height 0.5s ease-out' }">
            <div class="card">
                <VirtualDeviceEditor @close-editor="() => {showAddDevice = false; actions.refreshDevices()}"/>
            </div>
        </div>
        <div class="card">
            <div class="sm:shadow sm:rounded-lg sm:border sm:border-default overflow-hidden">
                <Table emptyText="No devices. Click '+' to add one." noScroll noHeader
                    class="!border-none !shadow-none">
                    <template #thead>
                        <tr>
                            <th scope="col">Device Name</th>
                            <th scope="col">File Path</th>
                            <th scope="col">Block Size</th>
                            <th scope="col">Type</th>
                            <th scope="col" class="flex flex-row justify-end">
                                <span class="sr-only">Delete</span>
                                <button @click="showAddDevice = !showAddDevice">
                                    <PlusIcon class="size-icon icon-default" />
                                </button>
                            </th>
                        </tr>
                    </template>
                    <template #tbody>
                        <VirtualDeviceEntry v-for="(device, index) in virtualDevices" :key="index" :device="device" @deleteDevice="actions.refreshDevices"/>
                    </template>
                </Table>
            </div>
        </div>
    </CardContainer>
</template>

<script setup lang="ts">
    import { CardContainer, wrapActions } from "@45drives/houston-common-ui";
    import { inject, ref, watch, type Ref } from "vue";
    import { VirtualDevice } from "../../types/VirtualDevice";
    import Table from "../Table.vue";
    import { PlusIcon } from "@heroicons/vue/24/solid";
    import VirtualDeviceEntry from "../virtualDevice/VirtualDeviceEntry.vue";
    import VirtualDeviceEditor from "../virtualDevice/VirtualDeviceEditor.vue";
    import type { ResultAsync } from "neverthrow";
    import type { ISCSIDriver } from "../../types/ISCSIDriver";
    import type { ProcessError } from "@45drives/houston-common-lib";

    const showAddDevice = ref(false);

    const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver")!;

    const virtualDevices = inject<Ref<VirtualDevice[]>>('virtualDevices')!;

    const forceRefreshRecords = inject<Record<string, boolean>>("forceRefreshRecords")!;

    watch(forceRefreshRecords, () => {
        if (forceRefreshRecords["devices"]) {
            refreshDevices();
            forceRefreshRecords["devices"] = false;
        }
    })

	const refreshDevices = () => {
		return driver.andThen((driver) => {
			return driver.getVirtualDevices().map((devices) => {
				virtualDevices.value = devices;
			});
		});
	}

    const actions = wrapActions({refreshDevices: refreshDevices})

    actions.refreshDevices();
</script>