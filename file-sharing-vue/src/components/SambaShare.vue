<template>
	<tr :class="index % 2 === 0 ? undefined : 'bg-gray-50'">
		<td
			class="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6 lg:pl-8"
		>{{ share.name }}</td>
		<td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{{ share.path }}</td>
		<td
			class="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6 lg:pr-8"
		>
			<a
				@click="showEditor = !showEditor"
				class="uppercase text-lime-500 hover:text-lime-800 cursor-pointer"
			>
				{{ showEditor ? 'Cancel' : 'Edit' }}
				<span class="sr-only">, {{ share.name }}</span>
			</a>
		</td>
		<td
			class="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6 lg:pr-8"
		>
			<a
				@click="$emit('delete-share', share)"
				class="uppercase text-red-600 hover:text-red-900 cursor-pointer"
			>
				Delete
				<span class="sr-only">, {{ share.name }}</span>
			</a>
		</td>
	</tr>
	<tr v-if="showEditor" :class="index % 2 === 0 ? undefined : 'bg-gray-50'">
		<td colspan="4">
			<SambaShareEditor :share="share" @apply-share="updateShare" @hide="showEditor = false" :users="users" :groups="groups" />
		</td>
	</tr>
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
		share: Object,
		index: Number,
		users: Array[String],
		groups: Array[String],
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
/* .row {
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
} */
</style>
