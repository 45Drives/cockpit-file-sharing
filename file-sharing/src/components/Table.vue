<template>
	<div class="shadow border border-default h-full overflow-hidden">
		<div
			v-if="!noHeader"
			class="bg-accent py-3 px-4 lg:px-6 text-sm font-semibold flex flex-row"
		>
			<div class="grow">
				<slot name="header">{{ headerText }}</slot>
			</div>
			<div
				:class="[noScroll ? '' : 'overflow-y-auto']"
				:style="{ 'scrollbar-gutter': noScroll ? 'auto' : 'stable' }"
			></div>
		</div>
		<div
			:class="[noShrink ? noShrinkHeight : shrinkHeight, noScroll ? '' : 'overflow-y-scroll', 'flex flex-col overflow-x-auto']"
			:style="{ 'scrollbar-gutter': noScroll ? 'auto' : 'stable' }"
		>
			<table class="min-w-full divide houston-table">
				<thead :class="[stickyHeaders ? 'use-sticky' : '']">
					<slot name="thead" />
				</thead>
				<tbody class="bg-default w-full">
					<slot name="tbody">
						<tr>
							<td colspan="100%" class="text-center align-middle text-muted text-sm">{{ emptyText }}</td>
						</tr>
					</slot>
				</tbody>
			</table>
		</div>
	</div>
</template>

<script>
export default {
	props: {
		headerText: {
			type: String,
			required: false,
			default: "Table",
		},
		emptyText: {
			type: String,
			required: false,
			default: "Nothing to show.",
		},
		noShrink: {
			type: Boolean,
			required: false,
			default: false,
		},
		stickyHeaders: {
			type: Boolean,
			required: false,
			default: false,
		},
		noShrinkHeight: {
			type: String,
			required: false,
			default: 'h-80'
		},
		shrinkHeight: {
			type: String,
			required: false,
			default: 'max-h-80'
		},
		noScroll: Boolean,
		noHeader: Boolean,
	}
}
</script>

<style>
@import "@45drives/cockpit-css/src/index.css";

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
