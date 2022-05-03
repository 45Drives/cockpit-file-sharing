<template>
	<button class="fixed right-5 bottom-4" @click="showInfo = true">
		<QuestionMarkCircleIcon class="icon-default size-icon" />
	</button>
	<ModalPopup
		:showModal="showInfo"
		:headerText="`${pluginName} ${version}`"
		noCancel
		applyText="Close"
		@apply="showInfo = false"
	>
		<div class="flex flex-col">
			<span>
				Created by
				<a
					class="text-link"
					href="https://www.45drives.com/?utm_source=Houston&utm_medium=UI&utm_campaign=OS-Link"
				>45Drives</a> for Houston UI (Cockpit)
			</span>
			<a class="text-link" href="sourceURL">Source Code</a>
			<a class="text-link" href="issuesURL">Issue Tracker</a>
		</div>
	</ModalPopup>
</template>

<script>
import { ref } from 'vue';
import { pluginVersion } from "../version";
import { QuestionMarkCircleIcon } from '@heroicons/vue/solid';
import ModalPopup from './ModalPopup.vue';

export default {
	props: {
		pluginName: String,
		sourceURL: String,
		issuesURL: String,
	},
	setup() {
		const version = ref(pluginVersion);
		const showInfo = ref(false);
		return { version, showInfo };
	},
	components: { ModalPopup, QuestionMarkCircleIcon }
}
</script>
