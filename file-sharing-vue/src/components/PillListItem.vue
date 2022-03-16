<template>
	<div
		class="border border-gray-300 flex flex-row items-center space-x-1 bg-neutral-50 pl-4 pr-3 py-1 my-1 rounded-full dark:bg-neutral-700 dark:border-gray-700"
	>
		<span>{{ item }}</span>
		<XIcon
			@click="$emit('remove-item')"
			class="h-4 w-4 cursor-pointer text-gray-400 hover:text-red-700"
		/>
	</div>
</template>

<script>
import { XIcon } from "@heroicons/vue/solid";
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
