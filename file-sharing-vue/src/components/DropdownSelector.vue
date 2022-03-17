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
