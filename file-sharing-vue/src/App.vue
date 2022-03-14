<template>
	<div class="h-full flex flex-col overflow-hidden text-gray-700 dark:text-gray-200">
		<FfdHeader moduleName="File Sharing" />
		<TabbedComponentSwitcher :components="tabs" :saveState="true" />
	</div>
</template>

<script setup>
import TabbedComponentSwitcher from './components/TabbedComponentSwitcher.vue';
import SambaManager from './components/SambaManager.vue'
import NfsManager from './components/NfsManager.vue';
import AfpManager from './components/AfpManager.vue';
import FfdHeader from './components/FfdHeader.vue';

const tabs = [{ title: 'Samba', component: SambaManager }, { title: 'NFS', component: NfsManager }, { title: 'AFP', component: AfpManager }];
</script>

<style>
#app {
	font-family: Avenir, Helvetica, Arial, sans-serif;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
}
</style>
