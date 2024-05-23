<template>
    <CenteredCardColumn>
        <CardContainer>
            <template v-slot:header>
                Devices
            </template>
			<div class="card">
				<div class="sm:shadow sm:rounded-lg sm:border sm:border-default overflow-hidden">
					<Table emptyText="No shares. Click '+' to add one." noScroll noHeader
						class="!border-none !shadow-none">
						<template #thead>
							<tr>
								<th scope="col">Device Name</th>
								<th scope="col">Block Size</th>
								<th scope="col">Type</th>
								<th scope="col" class="flex flex-row justify-end">
									<span class="sr-only">Edit/Delete</span>
									<button @click="actions.refreshShares">
										<PlusIcon class="size-icon icon-default" />
									</button>
								</th>
							</tr>
						</template>
						<template #tbody>
							<VirtualDeviceEntry v-for="(device, index) in virtualDevices" :key="index" :device="device" @deleteDevice="actions.refreshShares"/>
						</template>
					</Table>
				</div>
			</div>
        </CardContainer>
    </CenteredCardColumn>
</template>

<script setup lang="ts">
	import { CenteredCardColumn, CardContainer, pushNotification, Notification, wrapActions } from "@45drives/houston-common-ui";
	import { onMounted, provide, ref } from "vue";
	import { VirtualDevice } from "./types/VirtualDevice";
	import Table from "./Table.vue";
	import { PlusIcon } from "@heroicons/vue/24/solid";
	import VirtualDeviceEntry from "./VirtualDeviceEntry.vue";
	import { ISCSIDriverSingleServer } from "./types/ISCSIDriverSingleServer";
	import { getServer } from "@45drives/houston-common-lib";

	const virtualDevices = ref<VirtualDevice[]>([]);

	const iSCSIDriver = createISCSIDriver();

	provide('iSCSIDriver', iSCSIDriver);

	onMounted(() => {
		refreshShares();
	})

	function createISCSIDriver(){
		return getServer().map((server) => {
			return new ISCSIDriverSingleServer(server);
		})
	}

	function refreshShares() {
		return iSCSIDriver.andThen((driver) => {
			return driver.getVirtualDevices().map((devices) => {
				virtualDevices.value = devices;
			});
		});
	}

	const actions = wrapActions({createISCSIDriver, refreshShares})

</script>
