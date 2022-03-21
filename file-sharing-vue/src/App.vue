<template>
	<div class="h-full flex flex-col overflow-hidden text-gray-700 dark:text-gray-200">
		<FfdHeader moduleName="File Sharing" centerName />
		<TabbedComponentSwitcher :modalPopup="modalPopup" :components="tabs" :saveState="true" />
	</div>
	<ModalPopup ref="modalPopup" class="text-gray-700 dark:text-gray-200" />
</template>

<script setup>
import TabbedComponentSwitcher from './components/TabbedComponentSwitcher.vue';
import SambaManager from './components/SambaManager.vue'
import NfsManager from './components/NfsManager.vue';
import FfdHeader from './components/FfdHeader.vue';
import ModalPopup from './components/ModalPopup.vue';
import { ref } from 'vue';

const tabs = [{ title: 'Samba', component: SambaManager }, { title: 'NFS', component: NfsManager }];

const modalPopup = ref();
</script>

<style>
#app {
	font-family: Avenir, Helvetica, Arial, sans-serif;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
}
</style>
