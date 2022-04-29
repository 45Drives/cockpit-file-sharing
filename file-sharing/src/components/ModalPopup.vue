<template>
	<TransitionRoot as="template" :show="showModal">
		<Dialog as="div" class="fixed z-10 inset-0 overflow-y-auto">
			<div
				class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0 text-default"
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
						:class="[autoWidth ? 'sm:max-w-full' : 'sm:max-w-lg', 'relative inline-flex flex-col items-stretch align-bottom overflow-hidden transform transition-all sm:my-8 sm:align-middle text-left card']"
					>
						<div class="block w-[512px]"></div>
						<div class="card-header">
							<slot name="header">
								<h3 class="text-header">{{ headerText }}</h3>
							</slot>
						</div>
						<div class="card-body flex flex-row items-center gap-2">
							<div class="shrink-0">
								<slot name="icon" />
							</div>
							<div class="grow">
								<slot />
							</div>
						</div>
						<div class="card-footer button-group-row w-full justify-end">
							<button
								v-if="!noCancel"
								type="button"
								class="btn btn-secondary"
								@click="$emit('cancel')"
							>{{ cancelText }}</button>
							<button
								type="button"
								:class="['btn', applyDangerous ? 'btn-danger' : 'btn-primary']"
								@click="$emit('apply')"
								:disabled="disableContinue"
							>{{ applyText }}</button>
						</div>
					</div>
				</TransitionChild>
			</div>
		</Dialog>
	</TransitionRoot>
</template>

<script>
import { Dialog, DialogOverlay, DialogTitle, TransitionChild, TransitionRoot } from '@headlessui/vue';

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
		Dialog,
		DialogOverlay,
		DialogTitle,
		TransitionChild,
		TransitionRoot,
	},
	emits: [
		'apply',
		'cancel',
	]
};
</script>
