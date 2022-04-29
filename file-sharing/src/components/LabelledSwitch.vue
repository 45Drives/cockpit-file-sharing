<template>
	<SwitchGroup as="div" :class="[labelRight ? 'flex-row-reverse' : 'flex-row', 'inline-flex items-center']">
		<span :class="[labelRight ? 'grow' : '', 'flex flex-col']">
			<SwitchLabel as="span" class="text-label" passive><slot /></SwitchLabel>
			<SwitchDescription
				as="span"
				class="text-sm text-muted"
			><slot name="description" /></SwitchDescription>
		</span>
		<div :class="[labelRight ? '' : 'grow', 'w-4']"></div> <!-- spacer -->
		<Switch
			:modelValue="modelValue"
			@update:modelValue="newValue => { $emit('update:modelValue', newValue); $emit('change', newValue); $emit('input', newValue); }"
			:class="[modelValue ? 'bg-45d' : 'bg-well', 'relative inline-flex flex-shrink-0 h-6 w-11 p-[2px] rounded-full cursor-pointer focus:outline-none focus:ring-0 shadow-inner']"
		>
			<span
				aria-hidden="true"
				:class="[modelValue ? 'translate-x-5' : 'translate-x-0', 'pointer-events-none inline-block h-5 w-5 rounded-full bg-default shadow-md transform ring-0 transition-transform ease-in-out duration-200 top-px']"
			/>
		</Switch>
	</SwitchGroup>
</template>

<script>
import { Switch, SwitchDescription, SwitchGroup, SwitchLabel } from '@headlessui/vue'
import { watch, ref } from 'vue';
export default {
	props: {
		modelValue: Boolean,
		labelRight: Boolean,
	},
	// setup(props, { emit }) {
	// 	const internalModel = ref(props.modelValue);

	// 	const updateModelValue = () => emit('update:modelValue', internalModel.value);

	// 	watch(() => props.modelValue, (newValue) => internalModel.value = newValue);

	// 	return {
	// 		internalModel,
	// 		updateModelValue,
	// 	};
	// },
	components: {
		Switch,
		SwitchDescription,
		SwitchGroup,
		SwitchLabel,
	},
	emits: [
		'update:modelValue',
		'change',
		'input',
	],
}
</script>
