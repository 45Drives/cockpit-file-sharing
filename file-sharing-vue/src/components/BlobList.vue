<template>
	<div class="list">
		<BlobListItem v-for="(item, index) in list" :item="item" @remove-item="$emit('remove-item', item)"/>
	</div>
</template>

<script>
import BlobListItem from "./BlobListItem.vue";
export default {
    props: {
        list: Array
    },
    components: { BlobListItem },
	emits: [
		'remove-item'
	]
}
</script>

<style scoped>
.list {
	display: inline-flex;
	flex-flow: row wrap;
}
</style>
