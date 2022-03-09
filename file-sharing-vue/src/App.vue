<template>
	<div>
		<TabbedComponentSwitcher :components="tabs" :saveState="true" />
	</div>
</template>

<script setup>
import TabbedComponentSwitcher from './components/TabbedComponentSwitcher.vue';
import SambaManager from './components/SambaManager.vue'
import NfsManager from './components/NfsManager.vue';

const tabs = [{ title: 'Samba', component: SambaManager }, { title: 'NFS', component: NfsManager }];
</script>

<style>
#app {
	font-family: Avenir, Helvetica, Arial, sans-serif;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
	text-align: center;
	color: #2c3e50;
	margin-top: 60px;
}

button {
	font-weight: bold;
	border: 1px solid;
	border-radius: 5px;
	margin: 2px;
	display: inline-block;
	width: 100px;
	padding: 5px;
	background-color: white;
	color: rgb(79, 79, 255);
	border-color: rgb(79, 79, 255);
	box-sizing: border-box;
}

button:hover {
	cursor: pointer;
	border-width: 2px;
	margin-top: 1px;
	margin-bottom: 1px;
	background-color: rgb(210, 210, 255);
}
</style>
