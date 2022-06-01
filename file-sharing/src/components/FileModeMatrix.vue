<!--
Copyright (C) 2022 Josh Boudreau <jboudreau@45drives.com>

This file is part of Cockpit File Sharing.

Cockpit File Sharing is free software: you can redistribute it and/or modify it under the terms
of the GNU General Public License as published by the Free Software Foundation, either version 3
of the License, or (at your option) any later version.

Cockpit File Sharing is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with Cockpit File Sharing.
If not, see <https://www.gnu.org/licenses/>. 
-->

<template>
	<div class="inline-grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 justify-items-center">
		<label class="justify-self-start block text-sm font-medium"></label>
		<label class="text-label">Read</label>
		<label class="text-label">Write</label>
		<label class="text-label">Execute</label>

		<label class="justify-self-start text-label">Owner</label>
		<input type="checkbox" class="input-checkbox" v-model="modeMatrix.owner.read" />
		<input type="checkbox" class="input-checkbox" v-model="modeMatrix.owner.write" />
		<input type="checkbox" class="input-checkbox" v-model="modeMatrix.owner.execute" />

		<label class="justify-self-start text-label">Group</label>
		<input type="checkbox" class="input-checkbox" v-model="modeMatrix.group.read" />
		<input type="checkbox" class="input-checkbox" v-model="modeMatrix.group.write" />
		<input type="checkbox" class="input-checkbox" v-model="modeMatrix.group.execute" />

		<label class="justify-self-start text-label">Other</label>
		<input type="checkbox" class="input-checkbox" v-model="modeMatrix.other.read" />
		<input type="checkbox" class="input-checkbox" v-model="modeMatrix.other.write" />
		<input type="checkbox" class="input-checkbox" v-model="modeMatrix.other.execute" />

		<label class="justify-self-start text-label">Mode</label>
		<span class="col-span-3 font-mono font-medium whitespace-nowrap">{{ modeStr }}</span>
	</div>
</template>

<script>
import { reactive, computed } from 'vue';
export default {
	props: {
		modelValue: Number,
	},
	setup(props, { emit }) {
		const modeStr = computed(
			() =>
				(props.modelValue & 0b100000000 ? 'r' : '-')
				+ (props.modelValue & 0b010000000 ? 'w' : '-')
				+ (props.modelValue & 0b001000000 ? 'x' : '-')
				+ (props.modelValue & 0b000100000 ? 'r' : '-')
				+ (props.modelValue & 0b000010000 ? 'w' : '-')
				+ (props.modelValue & 0b000001000 ? 'x' : '-')
				+ (props.modelValue & 0b000000100 ? 'r' : '-')
				+ (props.modelValue & 0b000000010 ? 'w' : '-')
				+ (props.modelValue & 0b000000001 ? 'x' : '-')
				+ ` (${props.modelValue.toString(8).padStart(3, '0')})`
		);

		const computedBit = (mask, getter) => computed({
			get: () => getter() & mask ? true : false,
			set: (value) => emit('update:modelValue', value ? (props.modelValue | mask) : (props.modelValue & (~mask))),
		})

		const modeMatrix = reactive({
			other: {
				execute: computedBit(0b000000001, () => props.modelValue),
				write: computedBit(0b000000010, () => props.modelValue),
				read: computedBit(0b000000100, () => props.modelValue),
			},
			group: {
				execute: computedBit(0b000001000, () => props.modelValue),
				write: computedBit(0b000010000, () => props.modelValue),
				read: computedBit(0b000100000, () => props.modelValue),
			},
			owner: {
				execute: computedBit(0b001000000, () => props.modelValue),
				write: computedBit(0b010000000, () => props.modelValue),
				read: computedBit(0b100000000, () => props.modelValue),
			},
		});

		return {
			modeMatrix,
			modeStr,
		}
	},
	emits: [
		'update:modelValue',
	],
}
</script>
