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
	<div class="flex flex-col">
		<HoustonHeader
			moduleName="File Sharing"
			centerName
			sourceURL="https://github.com/45Drives/cockpit-file-sharing"
			issuesURL="https://github.com/45Drives/cockpit-file-sharing/issues"
			infoNudgeScrollbar
		>
			<div class="flex flex-row flex-nowrap items-stretch self-stretch gap-2">
				<button
					v-for="(entry, index) in components"
					:class="['px-2 border-b-2 border-b-transparent hover:border-b-neutral-400 dark:hover:border-b-neutral-600 text-lg font-medium sm:pt-2', currentTab === index ? '!border-b-red-700 dark:!border-b-red-800' : 'text-muted hover:text-default']"
					@click="switchTab(index)"
				>{{ entry.title }}</button>
			</div>
		</HoustonHeader>
		<!-- <div class="flex flex-row grow-0 items-stretch bg-well">
			<button
				v-for="(entry, index) in components"
				:class="['px-5 py-3 cursor-default z-10', currentTab === index ? 'bg-transparent' : 'bg-plugin-header shadow-lg']"
				@click="switchTab(index)"
			>{{ entry.title }}</button>
			<div class="grow bg-plugin-header z-10 shadow-lg"></div>
		</div>-->
		<div class="overflow-hidden grow basis-0">
			<div class="bg-well overflow-y-auto h-full" style="scrollbar-gutter: stable both-edges;">
				<component :modalPopup="modalPopup" :is="components[currentTab].component" />
			</div>
		</div>
	</div>
</template>

<script>
import HoustonHeader from "./HoustonHeader.vue";
import { ref } from "vue";
export default {
	props: {
		components: Array[Object],
		modalPopup: Object,
		saveState: {
			type: Boolean,
			default: false
		}
	},
	setup(props) {
		const currentTab = ref(0);
		if (props.saveState) {
			currentTab.value = Math.min(JSON.parse(localStorage.getItem('tabbed-component-switcher-tab')) ?? 0, props.components.length - 1);
		}

		const switchTab = (index) => {
			currentTab.value = index;
			if (props.saveState)
				localStorage.setItem('tabbed-component-switcher-tab', JSON.stringify(currentTab.value))
		}

		return {
			currentTab,
			switchTab,
		}
	},
	components: {
		HoustonHeader,
	}
}
</script>
