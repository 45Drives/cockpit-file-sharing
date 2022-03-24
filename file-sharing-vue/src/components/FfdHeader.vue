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
	<div
		class="p-2 flex items-baseline justify-between bg-neutral-50 dark:bg-neutral-900 border-b border-gray-200 dark:border-gray-700"
		:style="{ 'font-family': 'Red Hat Text', position: 'relative' }"
	>
		<div class="flex flex-row items-baseline">
			<img
				class="w-6 h-6 text-gray-50 mr-0.5 self-center"
				:src="darkMode ? '45d-fan-dark.svg' : '45d-fan-light.svg'"
			/>
			<h1 class="text-2xl">
				<span
					class="text-red-800 dark:text-white font-bold"
					:style="{ 'font-family': 'Source Sans Pro', 'font-size': '1.6rem' }"
				>45</span>
				<span class="text-gray-800 dark:text-red-600">Drives</span>
			</h1>
			<h1 v-if="!centerName" class="ml-5 text-red-800 dark:text-white text-2xl">{{ moduleName }}</h1>
		</div>
		<h1 v-if="centerName" class="text-red-800 dark:text-white text-2xl" :style="{position: 'absolute', left: '50%', top: '50%', transform: 'translateX(-50%) translateY(-50%)'}">{{ moduleName }}</h1>
		<button
			@click="darkMode = !darkMode"
			id="theme-toggle"
			type="button"
			class="text-gray-500 dark:text-gray-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 focus:outline-none rounded-lg text-sm p-2.5 justify-self-end w-10 h-10"
		>
			<SunIcon v-if="darkMode" />
			<MoonIcon v-else />
		</button>
	</div>
</template>

<script>
import "@fontsource/red-hat-text/700.css";
import "@fontsource/red-hat-text/400.css";
import "source-sans-pro/source-sans-pro.css";
import { SunIcon, MoonIcon } from "@heroicons/vue/solid";
import { ref, watch } from "vue";

export default {
	props: {
		moduleName: String,
		centerName: Boolean
	},
	setup(props) {
		const darkMode = ref(true);
		function getTheme() {
			let prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
			let theme = localStorage.getItem("color-theme");
			if (theme === null)
				return prefersDark;
			if (theme === "dark")
				return true;
			return false;
		}
		darkMode.value = getTheme();
		if (darkMode.value) {
			document.documentElement.classList.add("dark");
		} else {
			document.documentElement.classList.remove("dark");
		}
		watch(() => darkMode.value, (darkMode, oldDarkMode) => {
			localStorage.setItem("color-theme", darkMode ? "dark" : "light");
			if (darkMode) {
				document.documentElement.classList.add("dark");
			} else {
				document.documentElement.classList.remove("dark");
			}
		}, { lazy: false });
		return {
			darkMode,
		};
	},
	components: {
		SunIcon,
		MoonIcon
	}
};
</script>
