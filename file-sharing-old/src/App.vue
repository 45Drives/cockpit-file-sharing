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
		<TabbedComponentSwitcher
			:components="tabs"
			:saveState="true"
			class="grow"
		/>
	</div>
	<Notifications
		:notificationFIFO="notificationFIFO"
		ref="notifications"
	/>
	<WhatsNew
		v-if="false"
		localStorageKey="cockpit-file-sharing-show-whats-new-3.2.0-update"
		class="text-default"
	>
		<div>
			<p>A lot has changed since cockpit-file-sharing v2.4.5.</p>
			<p>See our <a
					class="text-link"
					href="https://github.com/45drives/cockpit-file-sharing"
				>GitHub page</a> for full details of features</p>
			<div
				class="text-sm px-4 py-2 m-2 bg-accent shadow-inner dark:shadow-none border dark:border-none border-default">
				<ul class="list-disc list-inside">
					<li>Improved UX with Vue and tailwindcss</li>
					<li>Moved user & group management to <a
							class="text-link"
							href="https://github.com/45drives/cockpit-identities"
						>Cockpit Identities</a></li>
					<li>One-click fix for `include = registry` missing from /etc/samba/smb.conf</li>
					<li>Import and export of configuration</li>
					<li>Under-the-hood improvements for reliability and speed</li>
					<li>And most importantly, dark mode</li>
				</ul>
			</div>
		</div>
	</WhatsNew>
</template>

<script setup>
import TabbedComponentSwitcher from './components/TabbedComponentSwitcher.vue';
import SambaManager from './components/SambaManager.vue'
import NfsManager from './components/NfsManager.vue';
import Notifications from './components/Notifications.vue';
import WhatsNew from './components/WhatsNew.vue';
import { onMounted, provide, ref } from 'vue';
import { notificationsInjectionKey, usersInjectionKey, groupsInjectionKey, processingUsersListInjectionKey, processingGroupsListInjectionKey } from './keys';
import { FIFO } from '@45drives/cockpit-helpers';
import useUserGroupLists from './composables/useUserGroupLists';

const props = defineProps({ notificationFIFO: FIFO });

const notifications = ref(null);
provide(notificationsInjectionKey, notifications);

const { users, groups, processingUsersList, processingGroupsList } = useUserGroupLists();
provide(usersInjectionKey, users);
provide(groupsInjectionKey, groups);
provide(processingUsersListInjectionKey, processingUsersList);
provide(processingGroupsListInjectionKey, processingGroupsList);

const tabs = ref([{ title: 'Samba', component: SambaManager }, { title: 'NFS', component: NfsManager }]);
</script>
