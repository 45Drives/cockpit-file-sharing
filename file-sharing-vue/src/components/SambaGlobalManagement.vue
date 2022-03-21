<template>
	<div class="card-header flex flex-row space-x-3">
		<h3 class="text-lg leading-6 font-medium">Global</h3>
		<LoadingSpinner v-if="!loaded" class="w-5 h-5" />
	</div>
	<div class="card-body space-y-5">
		<div>
			<label for="server-string" class="block text-sm font-medium">Server Description</label>
			<div class="mt-1">
				<input
					type="text"
					name="server-string"
					id="server-string"
					class="shadow-sm focus:border-gray-500 focus:ring-0 focus:outline-none block w-full sm:text-sm border-gray-300 dark:border-gray-700 dark:bg-neutral-800 rounded-md"
					placeholder="Description of Server"
					v-model="tmpGlobalConfig['server string']"
					@input="changesMade = true"
				/>
			</div>
		</div>
		<div>
			<label for="workgroup" class="block text-sm font-medium">Workgroup</label>
			<div class="mt-1">
				<input
					type="text"
					name="workgroup"
					id="workgroup"
					class="shadow-sm focus:border-gray-500 focus:ring-0 focus:outline-none block w-full sm:text-sm border-gray-300 dark:border-gray-700 dark:bg-neutral-800 rounded-md"
					placeholder="Workgroup"
					v-model="tmpGlobalConfig.workgroup"
					@input="changesMade = true"
				/>
			</div>
		</div>
		<div>
			<label for="log-level" class="block text-sm font-medium">Log Level</label>
			<select
				id="log-level"
				name="log-level"
				class="mt-1 block w-20 pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-0 dark:border-gray-700 dark:bg-neutral-800 focus:border-gray-500 sm:text-sm rounded-md"
				v-model="tmpGlobalConfig['log level']"
				@change="changesMade = true"
			>
				<option value="5">5</option>
				<option value="4">4</option>
				<option value="3">3</option>
				<option value="2">2</option>
				<option value="1">1</option>
				<option value="0">0</option>
			</select>
		</div>
		<div>
			<SwitchGroup as="div" class="flex items-center justify-between w-1/3">
				<span class="flex-grow flex flex-col">
					<SwitchLabel as="span" class="text-sm font-medium" passive>Global MacOS Shares</SwitchLabel>
					<SwitchDescription
							as="span"
							class="text-sm text-gray-500"
					>Optmize All Shares for MacOS</SwitchDescription>
				</span>
				<Switch
					v-model="globalMacOsShare"
					@click="switchMacOsShare(globalMacOsShare)"
					:class="[globalMacOsShare ? 'bg-red-600 dark:bg-red-700' : 'bg-neutral-200 dark:bg-neutral-900', 'relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-0']"
				>
					<span
						aria-hidden="true"
						:class="[globalMacOsShare ? 'translate-x-5' : 'translate-x-0', 'pointer-events-none inline-block h-5 w-5 rounded-full bg-white dark:bg-neutral-600 shadow transform ring-0 transition ease-in-out duration-200']"
					/>
				</Switch>
			</SwitchGroup>
		</div>
		<div @click="showAdvanced = !showAdvanced">
			<label for="global-advanced-settings" class="block text-sm font-medium cursor-pointer">
				Advanced Settings
				<ChevronDownIcon
					:style="{ display: 'inline-block', transition: '0.5s', transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0)' }"
					class="h-4 w-4"
				/>
			</label>
		</div>
		<div
			class="space-y-5"
			:style="{ 'max-height': showAdvanced ? '500px' : '0', transition: showAdvanced ? 'max-height 0.5s ease-in' : 'max-height 0.5s ease-out', overflow: 'hidden' }"
		>
			<textarea
				id="global-advanced-settings"
				name="global-advanced-settings"
				rows="4"
				v-model="globalConfigAdvancedSettingsStr"
				class="shadow-sm focus:border-gray-500 focus:ring-0 focus:outline-none block w-1/2 sm:text-sm border-gray-300 dark:border-gray-700 dark:bg-neutral-800 rounded-md"
				@change="changesMade = true; setAdvancedToggleStates()"
				placeholder="key = value"
			/>
		</div>
	</div>
	<div class="card-footer flex flex-row justify-end space-x-3">
		<button class="btn-primary" @click="resetChanges" v-if="changesMade">Cancel</button>
		<button class="btn-green" @click="apply" :disabled="!changesMade">Apply</button>
	</div>
</template>

<script>
import DropdownSelector from "./DropdownSelector.vue";
import { generateConfDiff, splitAdvancedSettings, joinAdvancedSettings } from "../functions";
import { ChevronDownIcon } from "@heroicons/vue/solid";
import useSpawn from "./UseSpawn";
import { ref, reactive, watch, toRefs } from "vue";
import LoadingSpinner from "./LoadingSpinner.vue";
import { Switch, SwitchDescription, SwitchGroup, SwitchLabel } from '@headlessui/vue'

const spawnOpts = {
	superuser: 'require',
}

export default {
	props: {
		globalConfig: Object,
		loaded: Boolean,
	},
	setup(props, ctx) {
		const tmpGlobalConfig = reactive({ ...props.globalConfig });
		const showAdvanced = ref(false);
		const globalConfigAdvancedSettingsStr = ref(joinAdvancedSettings(tmpGlobalConfig.advancedSettings));
		const changesMade = ref(false);
		const globalMacOsShare = ref(false);

		const switchMacOsShare = (value) => {
			if (value) {
				showAdvanced.value = true;
				if (!/fruit: ?encoding/.test(globalConfigAdvancedSettingsStr.value)) 1
				globalConfigAdvancedSettingsStr.value += "\nfruit:encoding = native";
				if (!/fruit: ?metadata/.test(globalConfigAdvancedSettingsStr.value))
					globalConfigAdvancedSettingsStr.value += "\nfruit:metadata = stream";
				if (/fruit: ?zero_file_id/.test(globalConfigAdvancedSettingsStr.value))
					globalConfigAdvancedSettingsStr.value = globalConfigAdvancedSettingsStr.value.replace(/(?<=fruit: ?zero_file_id ?=).*/, " yes");
				else
					globalConfigAdvancedSettingsStr.value += "\nfruit:zero_file_id = yes";
				if (/fruit: ?nfs_aces/.test(globalConfigAdvancedSettingsStr.value))
					globalConfigAdvancedSettingsStr.value = globalConfigAdvancedSettingsStr.value.replace(/(?<=fruit: ?nfs_aces ?=).*/, " no");
				else
					globalConfigAdvancedSettingsStr.value += "\nfruit:nfs_aces = no";
				if (/vfs objects/.test(globalConfigAdvancedSettingsStr.value))
					globalConfigAdvancedSettingsStr.value =
						globalConfigAdvancedSettingsStr.value
							.replace(/(?<=vfs objects ?=)(?!.*streams_xattr.*)/, " streams_xattr ")
							.replace(/(?<=vfs objects ?=)(?!.*fruit.*)/, " fruit ")
							.replace(/(?<=vfs objects ?=)(?!.*catia.*)/, " catia ");
				else
					globalConfigAdvancedSettingsStr.value += "\nvfs objects = catia fruit streams_xattr";
			} else {
				globalConfigAdvancedSettingsStr.value =
					globalConfigAdvancedSettingsStr.value
						.replace(/fruit: ?encoding.*\n?/, "")
						.replace(/fruit: ?metadata.*\n?/, "")
						.replace(/fruit: ?zero_file_id.*\n?/, "")
						.replace(/fruit: ?nfs_aces.*\n?/, "")
						.replace(/(?<=vfs objects ?=.*)catia ?/, "")
						.replace(/(?<=vfs objects ?=.*)fruit ?/, "")
						.replace(/(?<=vfs objects ?=.*)streams_xattr ?/, "");
			}
			globalConfigAdvancedSettingsStr.value = globalConfigAdvancedSettingsStr.value.split('\n').filter((line) => line !== "").join('\n').replace(/[\t ]+/g, " ").replace(/\s+$/gm, "");
			changesMade.value = true;
		}

		const setAdvancedToggleStates = () => {
			globalMacOsShare.value =
				/fruit: ?encoding ?=/.test(globalConfigAdvancedSettingsStr.value)
				&& /fruit: ?metadata ?=/.test(globalConfigAdvancedSettingsStr.value)
				&& /fruit: ?zero_file_id ?=/.test(globalConfigAdvancedSettingsStr.value)
				&& /fruit: ?nfs_aces ?=/.test(globalConfigAdvancedSettingsStr.value)
				&& /vfs objects ?=.*catia/.test(globalConfigAdvancedSettingsStr.value)
				&& /vfs objects ?=.*fruit/.test(globalConfigAdvancedSettingsStr.value)
				&& /vfs objects ?=.*streams_xattr/.test(globalConfigAdvancedSettingsStr.value);
		}

		const resetChanges = () => {
			Object.assign(tmpGlobalConfig, props.globalConfig);
			globalConfigAdvancedSettingsStr.value = joinAdvancedSettings(tmpGlobalConfig.advancedSettings);
			showAdvanced.value = Boolean(globalConfigAdvancedSettingsStr.value);
			setAdvancedToggleStates();
			changesMade.value = false;
		}

		const apply = async () => {
			tmpGlobalConfig.advancedSettings = splitAdvancedSettings(globalConfigAdvancedSettingsStr.value);
			globalConfigAdvancedSettingsStr.value = joinAdvancedSettings(tmpGlobalConfig.advancedSettings);
			let add, remove;
			({ add, remove } = generateConfDiff(props.globalConfig, tmpGlobalConfig));
			try {
				for (const args of add) {
					await useSpawn(['net', 'conf', 'setparm', 'global', ...args], spawnOpts).promise();
				}
				for (const args of remove) {
					await useSpawn(['net', 'conf', 'delparm', 'global', ...args], spawnOpts).promise();
				}
				Object.assign(props.globalConfig, tmpGlobalConfig);
				changesMade.value = false;
			} catch (state) {
				resetChanges();
				alert(state.stderr);
			}
		}

		watch(props.globalConfig, resetChanges, { lazy: false });

		return {
			tmpGlobalConfig,
			showAdvanced,
			globalConfigAdvancedSettingsStr,
			globalMacOsShare,
			changesMade,
			switchMacOsShare,
			setAdvancedToggleStates,
			resetChanges,
			apply,
		}
	},
	components: {
		DropdownSelector,
		ChevronDownIcon,
		LoadingSpinner,
		Switch,
		SwitchDescription,
		SwitchGroup,
		SwitchLabel,
	},
}
</script>

<style scoped>
</style>
