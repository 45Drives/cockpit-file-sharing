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
	<select
		@change="select($event)"
		class="mt-1 block pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-0 focus:border-gray-500 sm:text-sm rounded-md dark:bg-neutral-800"
	>
		<option value disabled selected hidden>{{ placeholder }}</option>
		<option v-for="(option, index) in options" :value="index">{{ option?.pretty ?? option }}</option>
	</select>
</template>

<script>
export default {
	props: {
		placeholder: String,
		options: Array,
	},
	setup(props, { emit }) {
		const select = (e) => {
			emit('select', props.options[e.target.value]);
			e.srcElement[0].selected = true;
		}
		return { select };
	}
}
</script>
