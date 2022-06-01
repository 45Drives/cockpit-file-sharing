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
	<SwitchGroup as="div" :class="[labelRight ? 'flex-row-reverse' : 'flex-row', 'inline-flex items-center']">
		<span :class="[labelRight ? 'grow' : '', 'flex flex-col']">
			<SwitchLabel as="div" class="text-label"><slot /></SwitchLabel>
			<SwitchDescription
				as="div"
				class="text-sm text-muted"
			><slot name="description" /></SwitchDescription>
		</span>
		<div :class="[labelRight ? '' : 'grow', 'w-4']"></div> <!-- spacer -->
		<Switch
			:modelValue="modelValue"
			@update:modelValue="newValue => { $emit('update:modelValue', newValue); $emit('change', newValue); $emit('input', newValue); }"
			:class="[modelValue ? 'bg-45d' : 'bg-well', 'inline-flex shrink-0 h-6 w-11 p-[2px] rounded-full cursor-pointer shadow-inner']"
		>
			<span
				aria-hidden="true"
				:class="[modelValue ? 'translate-x-5' : 'translate-x-0', 'pointer-events-none inline-block h-5 w-5 rounded-full bg-default shadow-md transform transition-transform ease-in-out duration-200']"
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
