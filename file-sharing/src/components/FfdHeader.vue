<!--
Copyright (C) 2022 Mark Hooper <mhooper@45drives.com>
                   Josh Boudreau <jboudreau@45drives.com>

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
	<div class="px-3 sm:px-5 flex items-center bg-plugin-header font-redhat shadow-lg z-10">
		<div class="flex flex-row flex-wrap items-baseline basis-32 grow shrink-0 gap-x-4">
			<div class="flex flex-row items-center my-5">
				<img
					class="w-6 h-6 mr-0.5"
					:src="darkMode ? './assets/images/45d-fan-dark.svg' : './assets/images/45d-fan-light.svg'"
				/>
				<h1 class="text-2xl">
					<span
						class="text-red-800 dark:text-white font-bold font-source-sans-pro"
						:style="{ 'font-size': '1.6rem' }"
					>45</span>
					<span class="text-gray-800 dark:text-red-600">Drives</span>
				</h1>
			</div>
			<slot />
			<LoadingSpinner v-if="showSpinner" class="size-icon self-center" />
		</div>
		<h1
			class="text-red-800 dark:text-white text-base sm:text-2xl cursor-pointer grow-0 text-center"
			@click="home"
		>{{ moduleName }}</h1>
		<div class="flex basis-32 justify-end items-center grow shrink-0 gap-buttons">
			<button :class="[infoButtonInHeader ? '' : infoNudgeScrollbar ? 'fixed right-5 bottom-2 z-50' : 'fixed right-2 bottom-2 z-50']" @click="showInfo = true">
				<QuestionMarkCircleIcon class="size-icon icon-default" />
			</button>
			<button
				@click="darkMode = !darkMode"
				@click.right.prevent="vape"
			>
				<SunIcon v-if="darkMode" class="size-icon-lg icon-default" />
				<MoonIcon v-else class="size-icon-lg icon-default" />
			</button>
		</div>
	</div>
	<ModalPopup
		:showModal="showInfo"
		:headerText="`${moduleName} ${version}`"
		noCancel
		applyText="Close"
		@apply="showInfo = false"
	>
		<div class="flex flex-col">
			<span>
				Created by
				<a
					class="text-link"
					href="https://www.45drives.com/?utm_source=Houston&utm_medium=UI&utm_campaign=OS-Link"
				>45Drives</a> for Houston UI (Cockpit)
			</span>
			<a class="text-link" href="sourceURL">Source Code</a>
			<a class="text-link" href="issuesURL">Issue Tracker</a>
		</div>
	</ModalPopup>
</template>

<script>
import "@fontsource/red-hat-text/700.css";
import "@fontsource/red-hat-text/400.css";
import "source-sans-pro/source-sans-pro.css";
import { SunIcon, MoonIcon, QuestionMarkCircleIcon } from "@heroicons/vue/solid";
import { ref, watch, inject } from "vue";
import LoadingSpinner from "./LoadingSpinner.vue";
import ModalPopup from './ModalPopup.vue';
import { pluginVersion } from '../version';

export default {
	props: {
		moduleName: String,
		sourceURL: String,
		issuesURL: String,
		showSpinner: Boolean,
		infoButtonInHeader: Boolean,
		infoNudgeScrollbar: Boolean,
	},
	setup(props) {
		const version = ref(pluginVersion);
		const showInfo = ref(false);
		const darkMode = inject('darkModeInjectionKey') ?? ref(true);
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
		const home = () => {
			cockpit.location.go('/');
		};
		const vape = (event) => {
			if (!event.ctrlKey)
				return;
			function makeWide(string) {
				let bytesOut = [];
				let bytesIn = new TextEncoder().encode(string);
				if (bytesIn.indexOf(0xef) !== -1) // already wide
					return string;
				bytesIn.forEach(byte => {
					if (/^[a-z]$/.test(String.fromCharCode(byte)))
						bytesOut.push(0xef, 0xbd, byte + 0x20);
					else if (/^[A-Z0-9]$/.test(String.fromCharCode(byte)))
						bytesOut.push(0xef, 0xbc, byte + 0x60);
					else if (String.fromCharCode(byte) === ' ')
						bytesOut.push(0xe2, 0x80, 0x83);
					else
						bytesOut.push(byte);
				});
				return new TextDecoder().decode(new Uint8Array(bytesOut));
			}
			setInterval(() => {
				let elems = document.querySelectorAll('#app *');
				for (let i = 0; i < elems.length; i++) {
					const element = elems[i];
					if (element.children.length > 0)
						continue;
					if (element.textContent) {
						element.textContent = makeWide(element.textContent);
						element.style.color = "#ff00fb";
					}
				}
			}, 500);
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
			version,
			showInfo,
			darkMode,
			home,
			vape,
		};
	},
	components: {
		SunIcon,
		MoonIcon,
		LoadingSpinner,
		ModalPopup,
		QuestionMarkCircleIcon,
	}
};
</script>
