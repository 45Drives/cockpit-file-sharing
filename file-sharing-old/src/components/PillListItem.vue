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
		class="border border-default bg-default flex flex-row items-center space-x-1 pl-4 pr-3 py-1 my-1 rounded-full"
	>
		<span>{{ item?.pretty ?? item }}</span>
		<XIcon
			@click="$emit('remove-item')"
			class="size-icon-sm cursor-pointer icon-default hover:icon-danger"
		/>
	</div>
</template>

<script>
import { XIcon } from "@heroicons/vue/20/solid";
export default {
	props: {
		item: String
	},
	components: {
		XIcon,
	}
}
</script>

<style scoped>
</style>
