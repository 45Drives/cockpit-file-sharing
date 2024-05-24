<template>
    <CenteredCardColumn>
        <VirtualDeviceTable/>

		<TargetTable/>
    </CenteredCardColumn>
</template>

<script setup lang="ts">
	import { CenteredCardColumn } from "@45drives/houston-common-ui";
	import { provide } from "vue";
	import { ISCSIDriverSingleServer } from "../types/ISCSIDriverSingleServer";
	import { getServer } from "@45drives/houston-common-lib";
	import VirtualDeviceTable from "./virtualDevice/VirtualDeviceTable.vue";
	import TargetTable from "./target/TargetTable.vue";

	const iSCSIDriver = createISCSIDriver();

	provide('iSCSIDriver', iSCSIDriver);

	function createISCSIDriver(){
		return getServer().map((server) => {
			return new ISCSIDriverSingleServer(server);
		})
	}

</script>
