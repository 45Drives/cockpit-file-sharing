<template>
	<div class="ml-1 relative overflow-visible inline-block" @click="show = !show" @mouseenter="show=true" @mouseleave="show=false" >
		<QuestionMarkCircleIcon class="text-gray-500 w-5 h-5" />
		<div class="absolute bg-neutral-500 text-gray-50 rounded-lg p-2 z-50 w-60" v-if="show" >
			<slot />
		</div>
	</div>
</template>

<script>
import { ref } from "vue";
import { QuestionMarkCircleIcon } from "@heroicons/vue/solid";
export default {
	setup() {
		const show = ref(false);

		return { show };
	},
	components: {
		QuestionMarkCircleIcon,
	}
}
</script>
