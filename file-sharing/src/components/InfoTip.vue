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
	<div class="ml-1 relative overflow-visible inline-block" @click="show = !show" @mouseenter="show=true" @mouseleave="show=false" >
		<QuestionMarkCircleIcon class="size-icon icon-default" />
		<div class="absolute bg-accent shadow-lg border-default text-muted font-normal whitespace-normal text-sm rounded-lg p-2 z-50 w-60" v-if="show" >
			<slot />
		</div>
	</div>
</template>

<script>
import { ref } from "vue";
import { QuestionMarkCircleIcon } from "@heroicons/vue/solid";
export default {
	setup() {
		const show = ref(false);

		return { show };
	},
	components: {
		QuestionMarkCircleIcon,
	}
}
</script>
