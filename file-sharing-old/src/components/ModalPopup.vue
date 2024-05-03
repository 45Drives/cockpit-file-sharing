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
	<TransitionRoot as="div" class="fixed inset-0 z-10 overflow-visible" :show="showModal">
		<TransitionChild as="template" enter="ease-out duration-500" enter-from="opacity-0" enter-to="opacity-100"
			leave="ease-in duration-500" leave-from="opacity-100" leave-to="opacity-0">
			<div class="fixed z-10 inset-0 bg-neutral-500/75 dark:bg-black/50 transition-opacity" />
		</TransitionChild>
		<div class="fixed z-10 inset-0 overflow-hidden flex items-end sm:items-center justify-center px-4 pb-20 sm:p-0">
			<TransitionChild as="template" enter="ease-out duration-300"
				enter-from="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-90"
				enter-to="opacity-100 translate-y-0 sm:scale-100" leave="ease-in duration-100"
				leave-from="opacity-100 translate-y-0 sm:scale-100"
				leave-to="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-75">
				<div
					:class="[autoWidth ? 'sm:max-w-full' : 'sm:max-w-lg', 'inline-flex flex-col items-stretch overflow-hidden transform transition-all text-left z-10']">
					<div class="block w-[512px]" /> <!-- set min width of div -->
					<div class="card flex flex-col items-stretch overflow-hidden">
						<div class="card-header">
							<slot name="header">
								<h3 class="text-header">{{ headerText }}</h3>
							</slot>
						</div>
						<div class="card-body flex flex-row items-center">
							<slot name="icon" />
							<div class="grow ml-2 only:ml-0 overflow-x-auto">
								<slot />
							</div>
						</div>
						<div class="card-footer button-group-row justify-end">
							<button v-if="!noCancel" type="button" class="btn btn-secondary" @click="$emit('cancel')">{{
									cancelText
							}}</button>
							<button type="button" :class="['btn', applyDangerous ? 'btn-danger' : 'btn-primary']"
								@click="$emit('apply')" :disabled="disableContinue">{{ applyText }}</button>
						</div>
					</div>
				</div>
			</TransitionChild>
		</div>
	</TransitionRoot>
</template>

<script>
import { TransitionChild, TransitionRoot } from '@headlessui/vue';

export default {
	props: {
		showModal: Boolean,
		noCancel: {
			type: Boolean,
			required: false,
			default: false,
		},
		autoWidth: Boolean,
		headerText: String,
		cancelText: {
			type: String,
			required: false,
			default: "Cancel",
		},
		applyText: {
			type: String,
			required: false,
			default: "Apply",
		},
		applyDangerous: Boolean,
		disableContinue: Boolean,
	},
	components: {
		TransitionChild,
		TransitionRoot,
	},
	emits: [
		'apply',
		'cancel',
	]
};
</script>
