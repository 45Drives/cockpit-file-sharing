<template>
	<div class="flex flex-row flex-wrap space-x-2">
		<PillListItem v-for="(item, index) in list" :item="item" @remove-item="$emit('remove-item', item)"/>
	</div>
</template>

<script>
import PillListItem from "./PillListItem.vue";
export default {
    props: {
        list: Array
    },
    components: { PillListItem },
}
</script>

<style scoped>
</style>
