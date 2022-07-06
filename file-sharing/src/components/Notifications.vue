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
	<div aria-live="assertive"
		class="fixed inset-0 flex items-end px-4 py-6 pointer-events-none sm:p-6 sm:items-start z-20 h-screen overflow-y-auto">
		<transition-group tag="div" class="w-full flex flex-col-reverse items-center sm:items-end sm:flex-col space-y-content"
			enter-active-class="transition-all transform ease-out duration-300"
			enter-from-class="translate-y-8 opacity-0 scale-95 sm:translate-y-0 sm:translate-x-8"
			enter-to-class="translate-y-0 opacity-100 scale-100 sm:translate-x-0"
			leave-active-class="transition-all transform ease-in duration-100"
			leave-from-class="opacity-100 scale-100 sm:translate-x-0"
			leave-to-class="opacity-0 scale-95 sm:translate-x-8">
			<div v-for="notification in notificationList" :key="notification.id"
				class="max-w-sm w-full shadow-lg pointer-events-auto overflow-hidden bg-default text-default"
				@mouseenter="notification.clearTimeouts?.()" @mouseleave="notification.setTimeouts?.()">
				<div class="p-4">
					<div class="flex items-start">
						<div class="flex-shrink-0" aria-hidden="true">
							<ExclamationCircleIcon v-if="notification.level === 'error'" class="icon-error size-icon-lg"
								aria-hidden="true" />
							<ExclamationCircleIcon v-else-if="notification.level === 'warning'"
								class="icon-warning size-icon-lg" aria-hidden="true" />
							<CheckCircleIcon v-else-if="notification.level === 'success'"
								class="icon-success size-icon-lg" aria-hidden="true" />
							<MinusCircleIcon v-else-if="notification.level === 'denied'" class="icon-error size-icon-lg"
								aria-hidden="true" />
							<InformationCircleIcon v-else class="icon-info size-icon-lg" />
						</div>
						<div class="ml-3 w-0 flex-1 pt-0.5">
							<p class="text-sm font-medium">{{ notification.title }}</p>
							<p class="mt-1 text-sm text-muted whitespace-pre-wrap" v-html="notification.body">
							</p>
							<div v-if="notification.actions?.length" class="mt-3 flex space-x-7">
								<button v-for="action in notification.actions" @click="action.callback"
									class="rounded-md text-sm font-medium text-primary">
									{{ action.text }}
								</button>
								<button @click="notification.show = false" type="button"
									class="rounded-md text-sm font-medium text-secondary">Dismiss</button>
							</div>
						</div>
						<div class="ml-4 flex-shrink-0 flex">
							<button @click="notification.show = false"
								class="icon-default">
								<span class="sr-only">Close</span>
								<XIcon class="size-icon" aria-hidden="true" />
							</button>
						</div>
					</div>
				</div>
			</div>
		</transition-group>
	</div>
</template>

<script>
import { ref, watch, reactive, onUnmounted } from 'vue';
import { InformationCircleIcon, ExclamationCircleIcon, MinusCircleIcon, CheckCircleIcon } from '@heroicons/vue/outline';
import { XIcon } from '@heroicons/vue/solid';
import { FIFO } from '@45drives/cockpit-helpers';

/** Notification passed to showNotification
 * 
 * @typedef {Object} Notification
 * @property {string} title -  Header text
 * @property {string} body - Notification content
 * @property {string} level - 'info'|'warning'|'error'|'success'
 * @property {number} timeout - time to display notification
 * @property {function} addAction - add action to notification
 */

export default {
	props: {
		notificationFIFO: FIFO,
	},
	setup(props) {
		const notificationList = ref([]);

		/** Construct new notification and show it
		 * 
		 * @param {string} title - Header text
		 * @param {string} body - Notification content
		 * @param {string} [level='info'] - 'info'|'warning'|'error'|'success'|'denied'
		 * @param {number} [timeout=10000] - time to display notification in milliseconds, or zero to display forever
		 * 
		 * @returns {Notification} - Object to chain add actions to
		 */
		const constructNotification = (title, body, level = 'info', timeout = 10000) => {
			const actions = [];
			const obj = reactive({
				title,
				body,
				level,
				timeout,
				actions,
			});
			showNotificationObj(obj);
			/** Add an action to the notification (chainable)
			 * 
			 * @param {string} text button text for action
			 * @param {function} callback onclick callback for action
			 */
			obj.addAction = (text, callback) => {
				obj.actions.push({
					text,
					callback: () => {
						callback();
						obj.removeSelf();
					}
				});
				return obj;
			};
			return obj;
		}

		/** Display notification to screen
		 * 
		 * @param {Notification} notificationObj notification to display
		 * 
		 */
		const showNotificationObj = (notificationObj) => {
			notificationObj.show = true;
			// backwards compat for setting show to false to remove notification
			notificationObj.stopShowWatch = watch(() => notificationObj.show, (value) => {
				if (!value) notificationObj.removeSelf();
			})
			notificationObj.id = Math.floor(Math.random() * Date.now());
			notificationObj.removeSelf = () => {
				const idToRemove = notificationObj.id
				notificationList.value = notificationList.value.filter(({ id }) => id !== idToRemove);
				notificationObj.stopShowWatch();
			}
			notificationObj.setTimeouts = () => {
				if (notificationObj.timeout > 0) {
					notificationObj.removerTimeout = setTimeout(
						notificationObj.removeSelf,
						notificationObj.timeout
					);
				}
			}
			notificationObj.clearTimeouts = () => {
				if (notificationObj.removerTimeout !== undefined)
					clearTimeout(notificationObj.removerTimeout);
			}
			notificationList.value = [notificationObj, ...notificationList.value];
			if (notificationObj.level === 'error') {
				console.error(notificationObj.title);
				console.error(notificationObj.body);
			}
			notificationObj.setTimeouts();
		}

		watch(() => props.notificationFIFO.getLen(), (newLen, oldLen) => {
			if (newLen > oldLen) {
				try {
					const notification = props.notificationFIFO.pop();
					if (notification)
						showNotificationObj(notification);
				} catch (error) {
					console.error(error);
					constructNotification("System Error", "An error occured, check the system console (CTRL+SHIFT+J) for more information.", 'error');
				}
			}
		});

		return {
			notificationList,
			constructNotification,
			showNotificationObj,
		}
	},
	components: {
		InformationCircleIcon,
		ExclamationCircleIcon,
		MinusCircleIcon,
		CheckCircleIcon,
		XIcon,
	},
}
</script>
