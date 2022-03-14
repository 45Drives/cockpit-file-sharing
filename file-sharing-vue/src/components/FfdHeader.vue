<template>
	<div
		class="p-2 flex items-baseline justify-between bg-neutral-50 dark:bg-neutral-900 border-b border-gray-200 dark:border-gray-700"
		:style="{ 'font-family': 'Red Hat Text' }"
	>
		<div class="flex flex-row items-baseline">
			<img class="w-6 h-6 text-gray-50 mr-0.5 self-center" :src="darkMode ? '45d-fan-dark.svg' : '45d-fan-light.svg'" />
			<h1 class="text-2xl">
				<span
					class="text-red-800 dark:text-white font-bold"
					:style="{ 'font-family': ['Source Sans Pro', 'sans-serif'] }"
				>45</span>
				<span class="text-gray-800 dark:text-red-600">Drives</span>
			</h1>
		</div>
		<h1 class="text-red-800 dark:text-white text-2xl">{{ moduleName }}</h1>
		<button
			@click="darkMode = !darkMode"
			id="theme-toggle"
			type="button"
			class="text-gray-500 dark:text-gray-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 focus:outline-none rounded-lg text-sm p-2.5 justify-self-end w-10 h-10"
		>
			<MoonIcon v-if="!darkMode" />
			<SunIcon v-else />
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
			console.log("switching theme");
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
