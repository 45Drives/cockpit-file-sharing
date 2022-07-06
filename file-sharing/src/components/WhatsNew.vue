<template>
	<ModalPopup
		:showModal="show"
		autoWidth
		:headerText="`File Sharing v${pluginVersion.split('-').shift()} - What's new`"
		cancelText="Don't show again"
		applyText="OK"
		@apply="show = false"
		@cancel="dontShowAgain"
	>
		<slot />
	</ModalPopup>
</template>

<script setup>
import ModalPopup from "./ModalPopup.vue";
import { ref, defineProps, onMounted } from "vue";
import { pluginVersion } from '../version';

const props = defineProps({
	localStorageKey: String,
})

const show = ref(false);

onMounted(() => {
	setTimeout(() => {
		show.value = JSON.parse(localStorage.getItem(props.localStorageKey)) ?? true;
	}, 500);
})

const dontShowAgain = () => {
	localStorage.setItem(props.localStorageKey, JSON.stringify(false));
	show.value = false;
}
</script>
