<template>
	<div class="space-y-1">
		<div class="grid grid-cols-4 gap-2 justify-items-center">
			<label class="justify-self-start block text-sm font-medium"></label>
			<label class="text-label">Read</label>
			<label class="text-label">Write</label>
			<label class="text-label">Execute</label>

			<label class="justify-self-start text-label">Owner</label>
			<input @change="updateValue" type="checkbox" class="input-checkbox" v-model="modeMatrix.owner.read" />
			<input @change="updateValue" type="checkbox" class="input-checkbox" v-model="modeMatrix.owner.write" />
			<input @change="updateValue" type="checkbox" class="input-checkbox" v-model="modeMatrix.owner.execute" />

			<label class="justify-self-start text-label">Group</label>
			<input @change="updateValue" type="checkbox" class="input-checkbox" v-model="modeMatrix.group.read" />
			<input @change="updateValue" type="checkbox" class="input-checkbox" v-model="modeMatrix.group.write" />
			<input @change="updateValue" type="checkbox" class="input-checkbox" v-model="modeMatrix.group.execute" />

			<label class="justify-self-start text-label">Other</label>
			<input @change="updateValue" type="checkbox" class="input-checkbox" v-model="modeMatrix.other.read" />
			<input @change="updateValue" type="checkbox" class="input-checkbox" v-model="modeMatrix.other.write" />
			<input @change="updateValue" type="checkbox" class="input-checkbox" v-model="modeMatrix.other.execute" />
		</div>

		<div>
			<label class="text-label">Result</label>
			<span
				class="ml-8 font-mono font-medium whitespace-nowrap"
			>{{ modeStr }}</span>
		</div>
	</div>
</template>

<script>
import { ref, reactive, watch } from 'vue';
export default {
	props: {
		modelValue: Number,
	},
	setup(props, { emit }) {
		const modeStr = ref("");
		const modeMatrix = reactive({
			owner: { read: true, write: true, execute: true },
			group: { read: true, write: false, execute: true },
			other: { read: true, write: false, execute: true },
		});

		const updateValue = () => {
			const mode =
				(modeMatrix.other.execute ? 0b000000001 : 0)
				| (modeMatrix.other.write ? 0b000000010 : 0)
				| (modeMatrix.other.read ? 0b000000100 : 0)
				| (modeMatrix.group.execute ? 0b000001000 : 0)
				| (modeMatrix.group.write ? 0b000010000 : 0)
				| (modeMatrix.group.read ? 0b000100000 : 0)
				| (modeMatrix.owner.execute ? 0b001000000 : 0)
				| (modeMatrix.owner.write ? 0b010000000 : 0)
				| (modeMatrix.owner.read ? 0b100000000 : 0);
			emit('update:modelValue', mode);
		}

		watch(modeMatrix, (current, old) => {
			modeStr.value =
				(modeMatrix.owner.read ? 'r' : '-')
				+ (modeMatrix.owner.write ? 'w' : '-')
				+ (modeMatrix.owner.execute ? 'x' : '-')
				+ (modeMatrix.group.read ? 'r' : '-')
				+ (modeMatrix.group.write ? 'w' : '-')
				+ (modeMatrix.group.execute ? 'x' : '-')
				+ (modeMatrix.other.read ? 'r' : '-')
				+ (modeMatrix.other.write ? 'w' : '-')
				+ (modeMatrix.other.execute ? 'x' : '-')
				+ ` (${props.modelValue.toString(8).padStart(3, '0')})`;
		}, { deep: true });

		watch(() => props.modelValue, (current, old) => {
			const other = {};
			const group = {};
			const owner = {};
			other.execute = props.modelValue & 0b000000001 ? true : false;
			other.write = props.modelValue & 0b000000010 ? true : false;
			other.read = props.modelValue & 0b000000100 ? true : false;
			group.execute = props.modelValue & 0b000001000 ? true : false;
			group.write = props.modelValue & 0b000010000 ? true : false;
			group.read = props.modelValue & 0b000100000 ? true : false;
			owner.execute = props.modelValue & 0b001000000 ? true : false;
			owner.write = props.modelValue & 0b010000000 ? true : false;
			owner.read = props.modelValue & 0b100000000 ? true : false;
			Object.assign(modeMatrix, { other, group, owner });
		}, { deep: true, immediate: true })

		return {
			modeMatrix,
			modeStr,
			updateValue,
		}
	},
	emits: [
		'update:modelValue',
	],
}
</script>
