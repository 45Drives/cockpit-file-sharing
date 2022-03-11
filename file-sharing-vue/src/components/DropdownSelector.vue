<template>
	<select
		@change="select($event)"
		class="mt-1 block pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-0 focus:border-gray-500 sm:text-sm rounded-md"
	>
		<option value disabled selected hidden>{{ placeholder }}</option>
		<option v-for="(option, index) in options" :value="option">{{ option }}</option>
	</select>
</template>

<script>
export default {
	props: {
		placeholder: String,
		options: Array,
	},
	methods: {
		select(e) {
			this.$emit('select', e.target.value);
			e.srcElement[0].selected = true;
		}
	},
	emits: [
		'select'
	]
}
</script>
