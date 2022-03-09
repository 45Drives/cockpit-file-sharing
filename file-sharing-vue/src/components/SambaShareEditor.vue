<template>
	<div class="editor col">
		<h3>{{ share ? 'Edit' : 'Add' }} Share {{ tmpShare.name }}</h3>
		<label for="name-field">
			Share Name:
			<input v-model="tmpShare.name" id="name-field" placeholder="Name" :disabled="share" />
		</label>
		<label for="description-field">
			Description:
			<input
				v-model="tmpShare.comment"
				id="description-field"
				placeholder="Share Description"
			/>
		</label>
		<label for="path-field">
			Share Path:
			<input v-model="tmpShare.path" id="path-field" placeholder="/example/path" />
		</label>
		<label for="windowsAcls-field">
			Windows ACLs:
			<input type="checkbox" true-value="yes" false-value="no" v-model="tmpShare.windowsAcls" id="windowsAcls-field" />
		</label>
		<label for="user-dropdown">
			Users:
			<BlobList :list="shareValidUsers" @remove-item="removeValidUser" />
		</label>
		<DropdownSelector :options="users" placeholder="Add User" @select="addValidUser"/>
		<label>
			Groups:
			<BlobList :list="shareValidGroups" @remove-item="removeValidGroup" />
		</label>
		<DropdownSelector :options="groups" placeholder="Add Group" @select="addValidGroup"/>
		<label for="guestOk-field">
			Guest OK:
			<input type="checkbox" true-value="yes" false-value="no" v-model="tmpShare.guestOk" id="guestOk-field" />
		</label>
		<label for="readOnly-field">
			Read Only:
			<input type="checkbox" true-value="yes" false-value="no" v-model="tmpShare.readOnly" id="readOnly-field" />
		</label>
		<label for="browseable-field">
			Browseable:
			<input type="checkbox" true-value="yes" false-value="no" v-model="tmpShare.browseable" id="browseable-field" />
		</label>
		<div @click="showAdvanced = !showAdvanced" class="clickable">
			Advanced Settings
			<span :class="[showAdvanced ? 'rotated' : '']">&#x25BE;</span>
		</div>
		<textarea v-if="showAdvanced" v-model="shareAdvancedSettingsStr" />
		<button @click="apply">Confirm</button>
	</div>
</template>

<script>
import BlobList from "./BlobList.vue";
import DropdownSelector from "./DropdownSelector.vue";
export default {
	props: {
		share: {
			type: Object,
			required: false,
			default: null
		},
	},
	data() {
		return {
			tmpShare: { ...this.share },
			showAdvanced: false,
			users: ["root", "test"],
			groups: ["root", "sudo", "test"],
			shareValidUsers: [],
			shareValidGroups: [],
			shareAdvancedSettingsStr: "",
		};
	},
	created() {
		if (this.share === null) {
			this.tmpShare = {
				name: "",
				comment: "",
				path: "",
				windowsAcls: "no",
				validUsers: "",
				guestOk: "no",
				readOnly: "no",
				browseable: "yes",
				advancedSettings: []
			};
		}
		[this.shareValidUsers, this.shareValidGroups] = this.splitValidUsers(this.tmpShare.validUsers);
		this.shareAdvancedSettingsStr = this.joinAdvancedSettings(this.tmpShare.advancedSettings);
	},
	methods: {
		apply() {
			this.tmpShare.validUsers = this.joinValidUsers(this.shareValidUsers, this.shareValidGroups);
			this.tmpShare.advancedSettings = this.splitAdvancedSettings(this.shareAdvancedSettingsStr);
			let errors = "";
			if ((errors = this.validate()) !== "") {
				alert("Applying share failed:\n" + errors);
				return;
			}
			this.$emit("apply-share", this.tmpShare);
		},
		validate() {
			let errors = "";
			if (this.tmpShare.name === "") {
				errors += "Name is empty.\n";
			}
			if (this.tmpShare.path == "") {
				errors += "Path is empty.\n";
			}
			return errors;
		},
		addValidUser(user) {
			this.shareValidUsers = [...new Set([...this.shareValidUsers, user])];
		},
		removeValidUser(user) {
			this.shareValidUsers = this.shareValidUsers.filter((a) => a !== user);
		},
		addValidGroup(group) {
			this.shareValidGroups = [...new Set([...this.shareValidGroups, group])];
		},
		removeValidGroup(group) {
			this.shareValidGroups = this.shareValidGroups.filter((a) => a !== group);
		},
		splitValidUsers(validUsersStr) {
			let validUsers = [];
			let validGroups = [];
			validUsersStr.split(/\s*,?\s+/).forEach((entity) => {
				if (entity.at(0) === '@')
					validGroups.push(entity.substring(1));
				else if (entity)
					validUsers.push(entity);
			});
			return [validUsers, validGroups];
		},
		joinValidUsers(validUsers, validGroups) {
			return [...validGroups.sort().map(group => `@${group}`), ...validUsers.sort()].join(" ");
		},
		joinAdvancedSettings(advancedSettings) {
			return advancedSettings.filter(a => !/^\s*$/.test(a)).join("\n");
		},
		splitAdvancedSettings(advancedSettings) {
			return advancedSettings.split('\n').filter(a => !/^\s*$/.test(a) && /\S+\s*=\s*\S+/.test(a));
		}
	},
	emits: [
		"apply-share"
	],
	components: { BlobList, DropdownSelector }
}
</script>

<style scoped>
.editor {
	border: 1px solid lightgrey;
	border-radius: 5px;
	padding: 5px;
	align-self: flex-start;
	background-color: white;
	margin: 5px;
}
.col {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
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
