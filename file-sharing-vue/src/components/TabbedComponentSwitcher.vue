<template>
	<div class="flex flex-row grow-0 dark:bg-neutral-800">
		<div
			v-for="(entry, index) in components"
			:class="['px-5 py-3 cursor-default', currentTab === index ? 'bg-neutral-50 dark:bg-neutral-900' : 'hover:bg-neutral-50 dark:hover:bg-neutral-900 dark:bg-neutral-800']"
			@click="switchTab(index)"
		>{{ entry.title }}</div>
	</div>
	<div class="bg-neutral-50 dark:bg-neutral-900 overflow-y-scroll grow">
		<component :is="components[currentTab].component" />
	</div>
</template>

<script>
export default {
	data() {
		return {
			currentTab: 0
		}
	},
	created() {
		if (this.saveState) {
			this.currentTab = Math.min(JSON.parse(localStorage.getItem('tabbed-component-switcher-tab')) ?? 0, this.components.length - 1);
		}
	},
	props: {
		components: Array[Object],
		saveState: {
			type: Boolean,
			default: false
		}
	},
	methods: {
		switchTab(index) {
			this.currentTab = index;
			if (this.saveState)
				localStorage.setItem('tabbed-component-switcher-tab', JSON.stringify(this.currentTab))
		}
	}
}
</script>
