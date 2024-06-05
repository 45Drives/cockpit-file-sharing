<template>
    <CenteredCardColumn>
        <VirtualDeviceTable/>

		<TargetTable/>
    </CenteredCardColumn>
</template>

<script setup lang="ts">
	import { CenteredCardColumn } from "@45drives/houston-common-ui";
	import { provide, ref } from "vue";
	import { ISCSIDriverSingleServer } from "../types/ISCSIDriverSingleServer";
	import { getServer } from "@45drives/houston-common-lib";
	import VirtualDeviceTable from "./virtualDevice/VirtualDeviceTable.vue";
	import TargetTable from "./target/TargetTable.vue";
	import type { VirtualDevice } from "../types/VirtualDevice";

	const iSCSIDriver = createISCSIDriver();

	provide('iSCSIDriver', iSCSIDriver);

	provide('virtualDevices', ref<VirtualDevice[]>())

	function createISCSIDriver(){
		return getServer().map((server) => {
			return new ISCSIDriverSingleServer(server);
		})
	}

</script>
