<template>
	<div class="card-header">
		<h3 class="text-lg leading-6 font-medium text-gray-900">Global</h3>
	</div>
	<div class="card-body space-y-5">
		<div>
			<label for="server-string" class="block text-sm font-medium text-gray-700">Server Description</label>
			<div class="mt-1">
				<input
					type="text"
					name="server-string"
					id="server-string"
					class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
					placeholder="Description of Server"
					v-model="tmpGlobalConfig.serverString"
				/>
			</div>
		</div>
		<div>
			<label for="workgroup" class="block text-sm font-medium text-gray-700">Workgroup</label>
			<div class="mt-1">
				<input
					type="text"
					name="workgroup"
					id="workgroup"
					class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
					placeholder="Workgroup"
					v-model="tmpGlobalConfig.workgroup"
				/>
			</div>
		</div>
		<div>
			<label for="log-level" class="block text-sm font-medium text-gray-700">Log Level</label>
			<select
				id="log-level"
				name="log-level"
				class="mt-1 block w-20 pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
				v-model="tmpGlobalConfig.logLevel"
			>
				<option value="5">5</option>
				<option value="4">4</option>
				<option value="3">3</option>
				<option value="2">2</option>
				<option value="1">1</option>
				<option value="0">0</option>
			</select>
		</div>
		<div @click="showAdvanced = !showAdvanced" class="cursor-pointer">
			<label for="advanced-settings" class="block text-sm font-medium text-gray-700">
				Advanced Settings
				<ChevronDownIcon
					:style="{ display: 'inline-block', transition: '0.5s', transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0)' }"
					class="h-4 w-4"
				/>
			</label>
		</div>
		<div
			:style="{ 'max-height': showAdvanced ? '500px' : '0', transition: showAdvanced ? 'max-height 0.5s ease-in' : 'max-height 0.5s ease-out', overflow: 'hidden' }"
		>
			<textarea
				id="advanced-settings"
				name="advanced-settings"
				rows=4
				v-model="globalConfigAdvancedSettingsStr"
				class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-1/2 sm:text-sm border-gray-300 rounded-md"
			/>
		</div>
	</div>
	<div class="card-footer">
		<button class="btn-primary" @click="apply">Apply</button>
	</div>
</template>

<script>
import DropdownSelector from "./DropdownSelector.vue";
import { generateConfDiff, splitAdvancedSettings, joinAdvancedSettings } from "../functions";
import { ChevronDownIcon } from "@heroicons/vue/solid";
export default {
	props: {
		initialGlobalConfig: Object,
	},
	data() {
		return {
			globalConfig: this.initialGlobalConfig,
			tmpGlobalConfig: { ...this.initialGlobalConfig, advancedSettings: [...this.initialGlobalConfig.advancedSettings] },
			showAdvanced: false,
			globalConfigAdvancedSettingsStr: "",
		};
	},
	created() {
		this.globalConfigAdvancedSettingsStr = joinAdvancedSettings(this.tmpGlobalConfig.advancedSettings);
		console.log(this.globalConfig);
	},
	methods: {
		async apply() {
			this.tmpGlobalConfig.advancedSettings = splitAdvancedSettings(this.globalConfigAdvancedSettingsStr);
			this.globalConfigAdvancedSettingsStr = joinAdvancedSettings(this.tmpGlobalConfig.advancedSettings);
			let errors = "";
			if ((errors = this.validate()) !== "") {
				alert("Applying share failed:\n" + errors);
				return;
			}
			let add, remove;
			({ add, remove } = generateConfDiff(this.globalConfig, this.tmpGlobalConfig));
			try {
				add.forEach((args) => {
					console.log("net conf setparm global " + args.map((arg) => arg !== "" && arg.indexOf(' ') === -1 ? arg : `"${arg}"`).join(" "));
				});
				remove.forEach((args) => {
					console.log("net conf delparm global " + args.map((arg) => arg !== "" && arg.indexOf(' ') === -1 ? arg : `"${arg}"`).join(" "));
				});
				Object.assign(this.globalConfig, this.tmpGlobalConfig);
			} catch (err) {
				Object.assign(this.tmpGlobalConfig, this.globalConfig);
				alert(err);
			}
		},
		validate() {
			let errors = "";
			return errors;
		},
	},
	components: { DropdownSelector, ChevronDownIcon }
}
</script>

<style scoped>
</style>
