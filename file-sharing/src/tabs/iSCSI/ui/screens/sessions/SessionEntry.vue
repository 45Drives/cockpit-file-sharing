<template>
    <tr>
        <td>{{ session.initiatorName }}</td>
        <td>{{ session.readAmountKB }} KB</td>
        <td>{{ session.writeAmountKB }} KB</td>
		<td class="button-group-row justify-end">
			<button @click="showEditor = !showEditor">
				<span class="sr-only">Edit</span>
				<ChevronDownIcon class="size-icon icon-default" />
			</button>
		</td>
    </tr>
	<tr></tr>
	<tr>
		<td colspan="3" class="!py-0">
			<Disclosure :show="showEditor" :transitionDuration=500 v-slot="{visible}" noButton>
				<template v-if="visible">
					<ConnectionTable :session="session"/>
				</template>
			</Disclosure>
		</td>
	</tr>
</template>

<script setup lang="ts">
	import { inject, ref } from "vue";
	import { ChevronDownIcon } from "@heroicons/vue/20/solid";
	import type { ISCSIDriver } from "../../types/ISCSIDriver";
	import { ResultAsync } from "neverthrow";
	import { ProcessError } from "@45drives/houston-common-lib";
    import type { Session } from "../../types/Session";
	import { Disclosure } from '@45drives/houston-common-ui';
	import ConnectionTable from "../connections/ConnectionTable.vue";

	const props = defineProps<{session: Session}>();

	console.log(props.session)

	const emit = defineEmits(['deleteEntry']);

	const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver");
	
	const showEditor = ref(false);

	if (driver === undefined) {
		throw new Error("iSCSI Driver is null");
	}

</script>