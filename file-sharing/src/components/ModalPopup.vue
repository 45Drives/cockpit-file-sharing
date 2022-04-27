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
	<TransitionRoot as="template" :show="showModal">
		<Dialog as="div" class="fixed z-10 inset-0 overflow-y-auto">
			<div
				class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0"
			>
				<TransitionChild
					as="template"
					enter="ease-out duration-300"
					enter-from="opacity-0"
					enter-to="opacity-100"
					leave="ease-in duration-200"
					leave-from="opacity-100"
					leave-to="opacity-0"
				>
					<DialogOverlay class="fixed inset-0 bg-neutral-500/75 dark:bg-black/50 transition-opacity" />
				</TransitionChild>

				<!-- This element is to trick the browser into centering the modal contents. -->
				<span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
				<TransitionChild
					as="template"
					enter="ease-out duration-300"
					enter-from="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
					enter-to="opacity-100 translate-y-0 sm:scale-100"
					leave="ease-in duration-200"
					leave-from="opacity-100 translate-y-0 sm:scale-100"
					leave-to="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
				>
					<div
						class="relative inline-block align-bottom bg-white dark:bg-neutral-900 px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6"
					>
						<div class="sm:flex sm:items-start">
							<div
								v-if="icon !== 'none'"
								:class="['mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full sm:mx-0 sm:h-10 sm:w-10']"
							>
								<ExclamationCircleIcon v-if="icon === 'danger'" class="h-12 w-12 text-red-600" aria-hidden="true" />
								<ExclamationIcon v-if="icon === 'warn'" class="h-12 w-12 text-orange-600" aria-hidden="true" />
								<InformationCircleIcon v-else-if="icon === 'info'" class="h-12 w-12 text-blue-400" aria-hidden="true" />
							</div>
							<div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
								<DialogTitle as="h3" class="text-lg leading-6 font-medium">{{ headerText }}</DialogTitle>
								<div class="my-2">
									<p class="text-sm">{{ bodyText }}</p>
									<input
										v-if="showInput"
										:type="inputType"
										:placeholder="placeholder"
										class="shadow-sm focus:border-gray-500 focus:ring-0 focus:outline-none block w-full sm:text-sm border-gray-300 dark:border-gray-700 dark:bg-neutral-800 rounded-md disabled:bg-neutral-100 disabled:text-gray-500 disabled:cursor-not-allowed"
										v-model="input"
									/>
									<slot />
								</div>
							</div>
						</div>
						<div class="flex flex-row space-x-3 justify-end">
							<button
								v-if="showCancel"
								type="button"
								class="btn btn-secondary"
								@click="buttonCallback_(false)"
								ref="cancelButtonRef"
							>Cancel</button>
							<button
								type="button"
								:class="['btn', 'btn-primary']"
								@click="buttonCallback_(true)"
							>{{ buttonText }}</button>
						</div>
					</div>
				</TransitionChild>
			</div>
		</Dialog>
	</TransitionRoot>
</template>

<script>
import { ref } from 'vue'
import { Dialog, DialogOverlay, DialogTitle, TransitionChild, TransitionRoot } from '@headlessui/vue'
import { ExclamationIcon, ExclamationCircleIcon, InformationCircleIcon } from '@heroicons/vue/outline'

const defaultOpts = {
	icon: "danger",
	placeholder: "",
	inputType: "text",
}

export default {
	setup() {
		const showModal = ref(false);
		const headerText = ref("Header Text");
		const bodyText = ref("Body Text");
		const buttonText = ref("Continue");
		const showCancel = ref(false);
		const showInput = ref(false);
		const inputType = ref("text");
		const placeholder = ref("");
		const input = ref("");
		const icon = ref(defaultOpts.icon);

		const buttonCallback = ref(() => { });

		const buttonCallback_ = (value) => {
			buttonCallback.value(value);
			showModal.value = false;
		};

		const alert = (header, body, opts = { ...defaultOpts }) => {
			headerText.value = header;
			bodyText.value = body ?? "";
			buttonText.value = "OK";
			showCancel.value = false;
			showInput.value = false;
			showModal.value = true;

			icon.value = opts.icon ?? defaultOpts.icon;

			return new Promise((resolve, reject) => {
				buttonCallback.value = () => {
					resolve();
				}
			});
		}

		const confirm = (header, body, opts = { ...defaultOpts }) => {
			headerText.value = header;
			bodyText.value = body ?? "";
			buttonText.value = "OK";
			showCancel.value = true;
			showInput.value = false;
			showModal.value = true;

			icon.value = opts.icon ?? defaultOpts.icon;

			return new Promise((resolve, reject) => {
				buttonCallback.value = (value) => {
					resolve(value);
				}
			});
		}

		const prompt = (header, body, opts = { ...defaultOpts }) => {
			headerText.value = header;
			bodyText.value = body ?? "";
			buttonText.value = "OK";
			showCancel.value = true;
			showInput.value = true;
			showModal.value = true;

			icon.value = opts.icon ?? defaultOpts.icon;
			inputType.value = opts.inputType ?? defaultOpts.inputType;
			placeholder.value = opts.placeholder ?? defaultOpts.placeholder;

			return new Promise((resolve, reject) => {
				buttonCallback.value = (value) => {
					if (value)
						resolve(input.value);
					else
						resolve(null);
				}
			});
		}

		return {
			showModal,
			headerText,
			bodyText,
			buttonText,
			showCancel,
			showInput,
			inputType,
			placeholder,
			input,
			buttonCallback_,
			buttonCallback,
			icon,
			alert,
			confirm,
			prompt,
		}
	},
	components: {
		Dialog,
		DialogOverlay,
		DialogTitle,
		TransitionChild,
		TransitionRoot,
		ExclamationIcon,
		ExclamationCircleIcon,
		InformationCircleIcon,
	},
};
</script>
