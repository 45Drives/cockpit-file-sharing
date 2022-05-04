<template>
	<!-- Global notification live region, render this permanently at the end of the document -->
	<div
		aria-live="assertive"
		class="fixed inset-0 flex items-end px-4 py-6 pointer-events-none sm:p-6 sm:items-start z-20 h-screen overflow-y-auto"
	>
		<div class="w-full flex flex-col items-center sm:items-end space-y-content">
			<!-- Notification panel, dynamically insert this into the live region when it needs to be displayed -->
			<transition
				v-for="notification in notificationList"
				:key="notification.id"
				enter-active-class="transform ease-out duration-300 transition"
				enter-from-class="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2"
				enter-to-class="translate-y-0 opacity-100 sm:translate-x-0"
				leave-active-class="transition ease-in duration-100"
				leave-from-class="opacity-100"
				leave-to-class="opacity-0"
				class="transition-transform"
			>
				<div
					v-if="notification.show"
					class="max-w-sm w-full shadow-lg pointer-events-auto overflow-hidden bg-default text-default"
					@mouseenter="notification.clearTimeouts?.()"
					@mouseleave="notification.setTimeouts?.()"
				>
					<div class="p-4">
						<div class="flex items-start">
							<div class="flex-shrink-0" aria-hidden="true">
								<ExclamationCircleIcon
									v-if="notification.level === 'error'"
									class="icon-error size-icon-lg"
									aria-hidden="true"
								/>
								<ExclamationCircleIcon
									v-else-if="notification.level === 'warning'"
									class="icon-warning size-icon-lg"
									aria-hidden="true"
								/>
								<CheckCircleIcon
									v-else-if="notification.level === 'success'"
									class="icon-success size-icon-lg"
									aria-hidden="true"
								/>
								<MinusCircleIcon
									v-else-if="notification.level === 'denied'"
									class="icon-error size-icon-lg"
									aria-hidden="true"
								/>
								<InformationCircleIcon v-else class="icon-info size-icon-lg" />
							</div>
							<div class="ml-3 w-0 flex-1 pt-0.5">
								<p class="text-sm font-medium">{{ notification.title }}</p>
								<p class="mt-1 text-sm text-muted whitespace-pre-wrap" v-html="notification.body"></p>
								<div v-if="notification.actions?.length" class="mt-3 flex space-x-7">
									<button
										v-for="action in notification.actions"
										@click="action.callback"
										class="rounded-md text-sm font-medium text-primary focus:outline-none focus:ring-0 focus:ring-offset-0"
									>
										{{ action.text }}
									</button>
									<button
										@click="notification.show = false"
										type="button"
										class="rounded-md text-sm font-medium text-secondary focus:outline-none focus:ring-0 focus:ring-offset-0"
									>Dismiss</button>
								</div>
							</div>
							<div class="ml-4 flex-shrink-0 flex">
								<button
									@click="notification.show = false"
									class="icon-default focus:outline-none focus:ring-0 focus:ring-offset-0"
								>
									<span class="sr-only">Close</span>
									<XIcon class="size-icon" aria-hidden="true" />
								</button>
							</div>
						</div>
					</div>
				</div>
			</transition>
		</div>
	</div>
</template>

<script>
import { ref, watch, reactive, onUnmounted } from 'vue';
import { InformationCircleIcon, ExclamationCircleIcon, MinusCircleIcon, CheckCircleIcon } from '@heroicons/vue/outline';
import { XIcon } from '@heroicons/vue/solid';
import { FIFO, UniqueIDGenerator } from '@45drives/cockpit-helpers';

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

		const uniqueIDGenerator = new UniqueIDGenerator();

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
				show: true,
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
						obj.show = false;
						callback();
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
			notificationObj.id = uniqueIDGenerator.get();
			notificationObj.setTimeouts = () => {
				if (notificationObj.timeout > 0) {
					notificationObj.timeout1 = setTimeout(
						() => notificationObj.show = false,
						notificationObj.timeout
					);
					notificationObj.timeout2 = setTimeout(
						() => {
							notificationList.value = notificationList.value.filter(obj => obj !== notificationObj);
							uniqueIDGenerator.release(notificationObj.id);
						},
						notificationObj.timeout + 2000
					);
				}
			}
			notificationObj.clearTimeouts = () => {
				if (notificationObj.timeout1 !== undefined)
					clearTimeout(notificationObj.timeout1);
				if (notificationObj.timeout2 !== undefined)
					clearTimeout(notificationObj.timeout2);
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

		let cleanupHandle = setInterval(() => {
			notificationList.value = notificationList.value.filter(n => n.show);
		}, 1000);

		onUnmounted(() => clearInterval(cleanupHandle));

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
