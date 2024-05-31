<template>
    <tr>
        <td>{{ session.initiatorName }}</td>
    </tr>
</template>

<script setup lang="ts">
	import { inject } from "vue";
	import type { ISCSIDriver } from "../../types/ISCSIDriver";
	import { ResultAsync } from "neverthrow";
	import { ProcessError } from "@45drives/houston-common-lib";
    import type { Session } from "../../types/Session";

	const props = defineProps<{session: Session}>();

	const emit = defineEmits(['deleteEntry']);

	const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver");

	if (driver === undefined) {
		throw new Error("iSCSI Driver is null");
	}

</script>