<template>
	<div class="editor">
		<div class="header">
			<h2>Global Options</h2>
		</div>
		<div class="col">
			<label for="description-field">
				Server Description:
				<input
					v-model="tmpGlobalConfig.serverString"
					id="description-field"
					placeholder="Server Description"
				/>
			</label>
			<label for="workgroup-field">
				Work Group:
				<input v-model="tmpGlobalConfig.workgroup" id="workgroup-field" />
			</label>
			<label for="log-level-dropdown">
				Log Level:
				<select v-model="tmpGlobalConfig.logLevel">
					<option value="5">5</option>
					<option value="4">4</option>
					<option value="3">3</option>
					<option value="2">2</option>
					<option value="1">1</option>
					<option value="0">0</option>
				</select>
			</label>
			<div @click="showAdvanced = !showAdvanced" class="clickable">
				Advanced Settings
				<span :class="[showAdvanced ? 'rotated' : '']">&#x25BE;</span>
			</div>
			<textarea v-if="showAdvanced" v-model="globalConfigAdvancedSettingsStr" />
			<button @click="apply">Apply</button>
		</div>
	</div>
</template>

<script>
import DropdownSelector from "./DropdownSelector.vue";
import { generateConfDiff, splitAdvancedSettings, joinAdvancedSettings } from "../functions";
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
	components: { DropdownSelector }
}
</script>

<style scoped>
.header {
	display: flex;
	flex-direction: row;
	justify-content: space-between;
	align-items: baseline;
	padding: 0 10px 0 10px;
}
.editor {
	display: flex;
	flex-direction: column;
	border: 1px solid lightgrey;
	border-radius: 5px;
	padding: 5px;
	align-self: flex-start;
	background-color: white;
	margin-bottom: 5px;
}
.col {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	padding: 5px 5px 5px 15px;
}

.rotated {
	transform: rotate(180deg);
	display: inline-block;
}

label {
	font-weight: bold;
}

.valid-entities {
	display: flex;
	flex-flow: row wrap;
}

.valid-entity {
	font-weight: normal;
}
</style>
