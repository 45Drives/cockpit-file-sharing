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
	<div class="card">
		<div class="card-header flex flex-row space-x-3 items-center">
			<div class="text-header">Global</div>
			<LoadingSpinner v-if="processing" class="size-icon" />
		</div>
		<div class="card-body space-y-content">
			<div>
				<label class="block text-label">Server Description</label>
				<input
					type="text"
					name="server-string"
					class="w-full input-textlike"
					placeholder="Description of server"
					v-model="tmpGlobalConfig['server string']"
					@input="changesMade = true"
				/>
			</div>
			<div>
				<label for="workgroup" class="block text-label">Workgroup</label>
				<input
					type="text"
					name="workgroup"
					class="w-full input-textlike"
					placeholder="Workgroup"
					v-model="tmpGlobalConfig.workgroup"
					@input="changesMade = true"
				/>
			</div>
			<div>
				<label for="log-level" class="block text-label">Log Level</label>
				<select
					id="log-level"
					name="log-level"
					class="input-textlike w-full sm:w-auto"
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
				<LabelledSwitch v-model="globalMacOsShare" @change="value => switchMacOsShare(value)" class="w-full sm:w-auto">
					Global MacOS Shares
					<template #description>
						Optimize all shares for MacOS
					</template>
				</LabelledSwitch>
			</div>
			<div @click="showAdvanced = !showAdvanced">
				<label class="block text-label cursor-pointer">
					Advanced Settings
					<ChevronDownIcon
						:style="{ display: 'inline-block', transition: '0.5s', transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0)' }"
						class="size-icon-sm"
					/>
				</label>
			</div>
			<div
				:style="{ 'max-height': showAdvanced ? '500px' : '0', transition: showAdvanced ? 'max-height 0.5s ease-in' : 'max-height 0.5s ease-out', overflow: 'hidden' }"
			>
				<textarea
					name="global-advanced-settings"
					rows="4"
					v-model="globalConfigAdvancedSettingsStr"
					class="w-full input-textlike"
					@change="changesMade = true; setAdvancedToggleStates()"
					placeholder="key = value"
				/>
			</div>
		</div>
		<div class="card-footer button-group-row justify-end">
			<button class="btn btn-secondary" @click="resetChanges" v-if="changesMade">Cancel</button>
			<button class="btn btn-primary" @click="apply" :disabled="!changesMade">Apply</button>
		</div>
	</div>
</template>

<script>
import DropdownSelector from "./DropdownSelector.vue";
import { generateConfDiff, splitAdvancedSettings, joinAdvancedSettings } from "../functions";
import { ChevronDownIcon } from "@heroicons/vue/solid";
import { useSpawn, errorStringHTML } from "@45drives/cockpit-helpers";
import { ref, reactive, watch, inject } from "vue";
import LoadingSpinner from "./LoadingSpinner.vue";
import LabelledSwitch from "./LabelledSwitch.vue";
import { notificationsInjectionKey } from "../keys";

export default {
	props: {
		globalConfig: Object,
		processing: Number,
	},
	setup(props, { emit }) {
		const tmpGlobalConfig = reactive({ ...props.globalConfig });
		const showAdvanced = ref(false);
		const globalConfigAdvancedSettingsStr = ref(joinAdvancedSettings(tmpGlobalConfig.advancedSettings));
		const changesMade = ref(false);
		const globalMacOsShare = ref(false);
		const notifications = inject(notificationsInjectionKey);

		const switchMacOsShare = (value) => {
			if (value) {
				showAdvanced.value = true;
				if (!/fruit: ?encoding/.test(globalConfigAdvancedSettingsStr.value)) 1
				globalConfigAdvancedSettingsStr.value += "\nfruit:encoding = native";
				if (!/fruit: ?metadata/.test(globalConfigAdvancedSettingsStr.value))
					globalConfigAdvancedSettingsStr.value += "\nfruit:metadata = stream";
				if (/fruit: ?zero_file_id/.test(globalConfigAdvancedSettingsStr.value))
					globalConfigAdvancedSettingsStr.value = globalConfigAdvancedSettingsStr.value.replace(/(fruit: ?zero_file_id ?=).*/, "$1 yes");
				else
					globalConfigAdvancedSettingsStr.value += "\nfruit:zero_file_id = yes";
				if (/fruit: ?nfs_aces/.test(globalConfigAdvancedSettingsStr.value))
					globalConfigAdvancedSettingsStr.value = globalConfigAdvancedSettingsStr.value.replace(/(fruit: ?nfs_aces ?=).*/, "$1 no");
				else
					globalConfigAdvancedSettingsStr.value += "\nfruit:nfs_aces = no";
				if (/vfs objects/.test(globalConfigAdvancedSettingsStr.value))
					globalConfigAdvancedSettingsStr.value =
						globalConfigAdvancedSettingsStr.value
							.replace(/(vfs objects ?=)(?!.*streams_xattr.*)/, "$1 streams_xattr ")
							.replace(/(vfs objects ?=)(?!.*fruit.*)/, "$1 fruit ")
							.replace(/(vfs objects ?=)(?!.*catia.*)/, "$1 catia ");
				else
					globalConfigAdvancedSettingsStr.value += "\nvfs objects = catia fruit streams_xattr";
			} else {
				globalConfigAdvancedSettingsStr.value =
					globalConfigAdvancedSettingsStr.value
						.replace(/fruit: ?encoding.*\n?/, "")
						.replace(/fruit: ?metadata.*\n?/, "")
						.replace(/fruit: ?zero_file_id.*\n?/, "")
						.replace(/fruit: ?nfs_aces.*\n?/, "")
						.replace(/(vfs objects ?=.*)catia ?/, "$1")
						.replace(/(vfs objects ?=.*)fruit ?/, "$1")
						.replace(/(vfs objects ?=.*)streams_xattr ?/, "$1");
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
			emit('startProcessing');
			try {
				tmpGlobalConfig.advancedSettings = splitAdvancedSettings(globalConfigAdvancedSettingsStr.value);
				globalConfigAdvancedSettingsStr.value = joinAdvancedSettings(tmpGlobalConfig.advancedSettings);
				let add, remove;
				({ add, remove } = generateConfDiff(props.globalConfig, tmpGlobalConfig));
				for (const args of add) {
					await useSpawn(['net', 'conf', 'setparm', 'global', ...args], { superuser: 'try' }).promise();
				}
				for (const args of remove) {
					await useSpawn(['net', 'conf', 'delparm', 'global', ...args], { superuser: 'try' }).promise();
				}
				Object.assign(props.globalConfig, tmpGlobalConfig);
				changesMade.value = false;
				notifications.value.constructNotification("Success", "Successfully updated global config", 'success');
			} catch (state) {
				resetChanges();
				notifications.value.constructNotification("Failed to apply global settings", errorStringHTML(state), 'error');
			} finally {
				emit('stopProcessing');
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
		LabelledSwitch,
	},
	emits: [
		'startProcessing',
		'stopProcessing',
	],
}
</script>

<style scoped>
</style>
