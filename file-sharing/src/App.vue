<!--
Copyright (C) 2022 Josh Boudreau <jboudreau@45drives.com>

This file is part of Cockpit File Sharing.

Cockpit File Sharing is free software: you can redistribute it and/or modify it under the terms
of the GNU General Public License as published by the Free Software Foundation, either version 3
of the License, or (at your option) any later version.

Cockpit File Sharing is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with Cockpit File Sharing.
If not, see <https://www.gnu.org/licenses/>. 
-->

<template>
	<div class="h-full flex flex-col text-default">
		<TabbedComponentSwitcher :components="tabs" :saveState="true" class="grow" />
	</div>
	<PluginInfo
		pluginName="Cockpit File Sharing"
		sourceURL="https://github.com/45Drives/cockpit-file-sharing"
		issuesURL="https://github.com/45Drives/cockpit-file-sharing/issues"
	/>
	<Notifications :notificationFIFO="notificationFIFO" ref="notifications" />
</template>

<script setup>
import TabbedComponentSwitcher from './components/TabbedComponentSwitcher.vue';
import SambaManager from './components/SambaManager.vue'
import NfsManager from './components/NfsManager.vue';
import Notifications from './components/Notifications.vue';
import { onMounted, provide, ref } from 'vue';
import { notificationsInjectionKey } from './keys';
import { FIFO } from '@45drives/cockpit-helpers';
import PluginInfo from './components/PluginInfo.vue';

const props = defineProps({ notificationFIFO: FIFO });

const notifications = ref(null);
provide(notificationsInjectionKey, notifications);

const tabs = ref([{ title: 'Samba', component: SambaManager }, { title: 'NFS', component: NfsManager }]);
</script>
