<template>
    <CenteredCardColumn>
        <CardContainer>
            <template v-slot:header>
                Devices
            </template>
			<div class="overflow-hidden"
				:style="{ 'max-height': showAddDevice ? '1500px' : '0', transition: showAddDevice ? 'max-height 0.5s ease-in' : 'max-height 0.5s ease-out' }">
				<div class="card">
					<VirtualDeviceEditor :existing-devices="virtualDevices" @close-editor="() => {showAddDevice = false; refreshDevices()}"/>
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

		<CardContainer>
			<template v-slot:header>
                Targets
            </template>
			<div class="overflow-hidden"
				:style="{ 'max-height': showAddTarget ? '1500px' : '0', transition: showAddTarget ? 'max-height 0.5s ease-in' : 'max-height 0.5s ease-out' }">
				<div class="card">
					<TargetEditor :existing-targets="targets" @close-editor="() => {showAddTarget = false; refreshTargets()}"/>
				</div>
			</div>
			<div class="card">
				<div class="sm:shadow sm:rounded-lg sm:border sm:border-default overflow-hidden">
					<Table emptyText="No targets. Click '+' to add one." noScroll noHeader
						class="!border-none !shadow-none">
						<template #thead>
							<tr>
								<th scope="col">Target Name</th>
								<th scope="col" class="flex flex-row justify-end">
									<span class="sr-only">Edit/Delete</span>
									<button @click="showAddTarget = !showAddTarget">
										<PlusIcon class="size-icon icon-default" />
									</button>
								</th>
							</tr>
						</template>
						<template #tbody>
							<TargetEntry v-for="(target, index) in targets" :key="index" :target="target" @deleteTarget="actions.refreshTargets"/>
						</template>
					</Table>
				</div>
			</div>
		</CardContainer>
    </CenteredCardColumn>
</template>

<script setup lang="ts">
	import { CenteredCardColumn, CardContainer, wrapActions } from "@45drives/houston-common-ui";
	import { provide, ref } from "vue";
	import { VirtualDevice } from "../types/VirtualDevice";
	import Table from "./Table.vue";
	import { PlusIcon } from "@heroicons/vue/24/solid";
	import VirtualDeviceEntry from "./virtualDevice/VirtualDeviceEntry.vue";
	import VirtualDeviceEditor from "./virtualDevice/VirtualDeviceEditor.vue";
	import TargetEntry from "./target/TargetEntry.vue"
	import { ISCSIDriverSingleServer } from "../types/ISCSIDriverSingleServer";
	import { getServer } from "@45drives/houston-common-lib";
	import type { Target } from "../types/Target";
import TargetEditor from "./target/TargetEditor.vue";

	const virtualDevices = ref<VirtualDevice[]>([]);
	const targets = ref<Target[]>([]);

	const iSCSIDriver = createISCSIDriver();

	const showAddDevice = ref(false);

	const showAddTarget = ref(false);

	provide('iSCSIDriver', iSCSIDriver);

	refreshDevices();
	refreshTargets();

	function createISCSIDriver(){
		return getServer().map((server) => {
			return new ISCSIDriverSingleServer(server);
		})
	}

	function refreshDevices() {
		return iSCSIDriver.andThen((driver) => {
			return driver.getVirtualDevices().map((devices) => {
				virtualDevices.value = devices;
			});
		});
	}

	function refreshTargets() {
		return iSCSIDriver.andThen((driver) => {
			return driver.getTargets().map((targetList) => {
				targets.value = targetList;
			})
		});
	}

	const actions = wrapActions({createISCSIDriver, refreshDevices: refreshDevices, refreshTargets: refreshTargets})

</script>
