<template>
	<div class="flex flex-row flex-wrap space-x-2">
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
</style>
