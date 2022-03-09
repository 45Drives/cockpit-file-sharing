<template>
	<div>
		<div class="header">
			<div
				v-for="(entry, index) in components"
				:class="['tab', currentTab === index ? 'selected' : '']"
				@click="switchTab(index)"
			>{{ entry.title }}</div>
		</div>
		<div class="container">
			<component :is="components[currentTab].component" />
		</div>
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

<style scoped>
.header {
	display: flex;
	flex-direction: row;
	align-items: center;
	justify-content: flex-start;
	justify-items: flex-start;
	text-align: center;
}

.tab {
	padding: 20px 30px 10px 30px;
	cursor: pointer;
	text-align: center;
}

.tab.selected {
	background-color: #ececec;
	cursor: auto;
}

.container {
	background-color: #ececec;
	padding: 5px;
}
</style>
