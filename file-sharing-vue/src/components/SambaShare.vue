<template>
	<div class="outer-container">
		<div class="row">
			<div class="share-name row-item">{{ share.name }}</div>
			<div class="share-path row-item">{{ share.path }}</div>
			<button class="row-item" @click="showEditor = !showEditor">{{ showEditor ? 'Cancel' : 'Edit' }}</button>
			<button class="row-item" @click="$emit('delete-share', share)">Delete</button>
		</div>
		<SambaShareEditor v-if="showEditor" :share="share" @apply-share="updateShare" />
	</div>
</template>

<script>
import SambaShareEditor from "./SambaShareEditor.vue";
export default {
	data() {
		return {
			showEditor: false,
		};
	},
	props: {
		share: Object
	},
	methods: {
		updateShare(newShare) {
			this.$emit('update-share', this.share, newShare);
			this.showEditor = false;
		}
	},
	components: { SambaShareEditor },
	emits: [
		'delete-share',
		'update-share'
	]
}
</script>

<style scoped>
.row {
	display: flex;
	flex-direction: row;
	align-items: baseline;
	gap: 100px;
}

.outer-container:nth-of-type(even) {
	background-color: rgb(236, 236, 236);
}

.row > div {
	flex-basis: 100px;
}

button {
	background-color: white;
	color: maroon;
	border-color: maroon;
}

button:hover {
	background-color: pink;
}
</style>
