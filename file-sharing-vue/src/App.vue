<template>
	<div class="dark h-full">
		<TabbedComponentSwitcher :components="tabs" :saveState="true" />
	</div>
</template>

<script setup>
import TabbedComponentSwitcher from './components/TabbedComponentSwitcher.vue';
import SambaManager from './components/SambaManager.vue'
import NfsManager from './components/NfsManager.vue';
import AfpManager from './components/AfpManager.vue';

const tabs = [{ title: 'Samba', component: SambaManager }, { title: 'NFS', component: NfsManager }, { title: 'AFP', component: AfpManager }];
</script>

<style>
#app {
	font-family: Avenir, Helvetica, Arial, sans-serif;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
	color: #2c3e50;
}
</style>
