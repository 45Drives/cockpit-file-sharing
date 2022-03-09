<template>
	<select @change="select($event)">
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
