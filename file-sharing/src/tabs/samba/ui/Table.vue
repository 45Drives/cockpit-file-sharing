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

<script setup lang="ts">

import { defineProps, withDefaults } from "vue";

withDefaults(defineProps<{
	emptyText?: string;
	stickyHeaders?: boolean;
	noScroll?: boolean;
}>(), {
	emptyText: "Nothing to show.",
	stickyHeaders: false,
	noScroll: false
});

</script>

<template>
	<div class="h-full overflow-hidden bg-accent">
		<div
			v-if="$slots.header"
			class="py-3 px-4 lg:px-6 text-sm font-semibold flex flex-row"
		>
			<div class="grow">
				<slot name="header"></slot>
			</div>
			<div
				:class="{ 'overflow-y-scroll': !noScroll }"
				:style="{ 'scrollbar-gutter': noScroll ? 'auto' : 'stable' }"
			></div>
		</div>
		<div
			class="flex flex-col overflow-x-auto"
			:class="{ 'overflow-y-scroll': !noScroll }"
			:style="{ 'scrollbar-gutter': noScroll ? 'auto' : 'stable' }"
		>
			<table class="min-w-full divide-y divide-default houston-table">
				<thead :class="{ 'use-sticky': stickyHeaders }">
					<slot name="thead" />
				</thead>
				<tbody class="bg-default w-full">
					<slot name="tbody">
						<tr>
							<td
								colspan="100%"
								class="text-center align-middle text-muted text-sm"
							>{{ emptyText }}</td>
						</tr>
					</slot>
				</tbody>
			</table>
		</div>
	</div>
</template>

<style>
@import "@45drives/houston-common-css/src/index.css";

table.houston-table thead.use-sticky tr th {
	@apply sticky z-10 top-0;
}

table.houston-table th,
table.houston-table td {
	@apply py-2 px-4 lg:px-6 whitespace-nowrap text-sm;
}

table.houston-table th:not(.text-right):not(.text-center),
table.houston-table td:not(.text-right):not(.text-center) {
	@apply text-left;
}

table.houston-table th {
	@apply bg-accent font-semibold;
}

table.houston-table tr {
	@apply even:bg-accent;
}
</style>
