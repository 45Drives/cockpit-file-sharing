<template>
	<div>{{ item }} <span @click="$emit('remove-item')">X</span></div>
</template>

<script>
export default {
	props: {
		item: String
	},
	emits: [
		'remove-item'
	]
}
</script>

<style scoped>
div {
	font-weight: normal;
	padding: 5px;
	text-align: center;
	border-radius: 5px;
	margin: 5px;
	background-color: rgb(236, 236, 236);
}
span {
	color: maroon;
	font-weight: bold;
	cursor: pointer;
}
</style>
