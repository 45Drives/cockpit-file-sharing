<template>
	<div class="space-y-5 px-4 pb-4">
		<h3 v-if="!share">New Share</h3>
		<div>
			<label for="name" class="block text-sm font-medium text-gray-700">Share Name</label>
			<div class="mt-1">
				<input
					type="text"
					name="name"
					id="name"
					class="shadow-sm focus:border-gray-500 focus:ring-0 focus:outline-none block w-full sm:text-sm border-gray-300 rounded-md disabled:bg-gray-100 disabled:text-gray-500"
					placeholder="Share Name"
					v-model="tmpShare.name"
					:disabled="share"
				/>
			</div>
		</div>
		<div>
			<label for="description" class="block text-sm font-medium text-gray-700">Share Description</label>
			<div class="mt-1">
				<input
					type="text"
					name="description"
					id="description"
					class="shadow-sm focus:border-gray-500 focus:ring-0 focus:outline-none block w-full sm:text-sm border-gray-300 rounded-md"
					placeholder="Share Name"
					v-model="tmpShare.comment"
				/>
			</div>
		</div>
		<div>
			<label for="path" class="block text-sm font-medium text-gray-700">Path</label>
			<div class="mt-1">
				<input
					type="text"
					name="path"
					id="path"
					class="shadow-sm focus:border-gray-500 focus:ring-0 focus:outline-none block w-full sm:text-sm border-gray-300 rounded-md"
					placeholder="Share Path/Directory"
					v-model="tmpShare.path"
				/>
			</div>
		</div>
		<div>
			<label class="block text-sm font-medium text-gray-700">Valid Users</label>
			<BlobList :list="shareValidUsers" @remove-item="removeValidUser" />
			<DropdownSelector :options="users" placeholder="Add User" @select="addValidUser" />
		</div>
		<div>
			<label class="block text-sm font-medium text-gray-700">Valid Groups</label>
			<BlobList :list="shareValidGroups" @remove-item="removeValidGroup" />
			<DropdownSelector :options="groups" placeholder="Add Group" @select="addValidGroup" />
		</div>
		<div>
			<SwitchGroup as="div" class="flex items-center justify-between w-full">
				<span class="flex-grow flex flex-col">
					<SwitchLabel as="span" class="text-sm font-medium text-gray-700" passive>Windows ACLs</SwitchLabel>
					<!-- <SwitchDescription
						as="span"
						class="text-sm text-gray-500"
					>Nulla amet tempus sit accumsan. Aliquet turpis sed sit lacinia.</SwitchDescription>-->
				</span>
				<Switch
					v-model="tmpShare.windowsAcls"
					:class="[tmpShare.windowsAcls ? 'bg-red-600' : 'bg-gray-200', 'relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-0']"
				>
					<span
						aria-hidden="true"
						:class="[tmpShare.windowsAcls ? 'translate-x-5' : 'translate-x-0', 'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200']"
					/>
				</Switch>
			</SwitchGroup>
		</div>
		<div>
			<SwitchGroup as="div" class="flex items-center justify-between w-full">
				<span class="flex-grow flex flex-col">
					<SwitchLabel as="span" class="text-sm font-medium text-gray-700" passive>Guest OK</SwitchLabel>
					<!-- <SwitchDescription
						as="span"
						class="text-sm text-gray-500"
					>Allow guests in share.</SwitchDescription>-->
				</span>
				<Switch
					v-model="tmpShare.guestOk"
					:class="[tmpShare.guestOk ? 'bg-red-600' : 'bg-gray-200', 'relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-0']"
				>
					<span
						aria-hidden="true"
						:class="[tmpShare.guestOk ? 'translate-x-5' : 'translate-x-0', 'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200']"
					/>
				</Switch>
			</SwitchGroup>
		</div>
		<div>
			<SwitchGroup as="div" class="flex items-center justify-between w-full">
				<span class="flex-grow flex flex-col">
					<SwitchLabel as="span" class="text-sm font-medium text-gray-700" passive>Read Only</SwitchLabel>
					<!-- <SwitchDescription
						as="span"
						class="text-sm text-gray-500"
					>Make share read only.</SwitchDescription>-->
				</span>
				<Switch
					v-model="tmpShare.readOnly"
					:class="[tmpShare.readOnly ? 'bg-red-600' : 'bg-gray-200', 'relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-0']"
				>
					<span
						aria-hidden="true"
						:class="[tmpShare.readOnly ? 'translate-x-5' : 'translate-x-0', 'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200']"
					/>
				</Switch>
			</SwitchGroup>
		</div>
		<div>
			<SwitchGroup as="div" class="flex items-center justify-between w-full">
				<span class="flex-grow flex flex-col">
					<SwitchLabel as="span" class="text-sm font-medium text-gray-700" passive>Browseable</SwitchLabel>
					<!-- <SwitchDescription
						as="span"
						class="text-sm text-gray-500"
					>Allow browsing of share.</SwitchDescription>-->
				</span>
				<Switch
					v-model="tmpShare.browseable"
					:class="[tmpShare.browseable ? 'bg-red-600' : 'bg-gray-200', 'relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-0']"
				>
					<span
						aria-hidden="true"
						:class="[tmpShare.browseable ? 'translate-x-5' : 'translate-x-0', 'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200']"
					/>
				</Switch>
			</SwitchGroup>
		</div>
		<div @click="showAdvanced = !showAdvanced">
			<label for="advanced-settings" class="block text-sm font-medium text-gray-700 cursor-pointer">
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
				rows="4"
				v-model="shareAdvancedSettingsStr"
				class="shadow-sm focus:border-gray-500 focus:ring-0 focus:outline-none block w-1/2 sm:text-sm border-gray-300 rounded-md"
			/>
		</div>
		<div class="flex flex-row justify-end space-x-3">
			<button class="btn-primary" @click="$emit('hide')">Cancel</button>
			<button class="btn-green" @click="apply">Confirm</button>
		</div>
	</div>
</template>

<script>
import BlobList from "./BlobList.vue";
import DropdownSelector from "./DropdownSelector.vue";
import { splitAdvancedSettings, joinAdvancedSettings, strToBool } from "../functions";
import { Switch, SwitchDescription, SwitchGroup, SwitchLabel } from '@headlessui/vue'
import { ChevronDownIcon } from "@heroicons/vue/solid";
export default {
	props: {
		share: {
			type: Object,
			required: false,
			default: null
		},
		users: Array[String],
		groups: Array[String],
	},
	data() {
		return {
			tmpShare: this.share
				? {
					...this.share,
					windowsAcls: strToBool(this.share?.windowsAcls),
					guestOk: strToBool(this.share?.guesOk),
					readOnly: strToBool(this.share?.readOnly),
					browseable: strToBool(this.share?.browseable)
				}
				: null,
			showAdvanced: false,
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
				windowsAcls: false,
				validUsers: "",
				guestOk: false,
				readOnly: false,
				browseable: true,
				advancedSettings: []
			};
		}
		[this.shareValidUsers, this.shareValidGroups] = this.splitValidUsers(this.tmpShare.validUsers);
		this.shareAdvancedSettingsStr = joinAdvancedSettings(this.tmpShare.advancedSettings);
	},
	methods: {
		apply() {
			this.tmpShare.validUsers = this.joinValidUsers(this.shareValidUsers, this.shareValidGroups);
			this.tmpShare.advancedSettings = splitAdvancedSettings(this.shareAdvancedSettingsStr);
			this.shareAdvancedSettingsStr = joinAdvancedSettings(this.tmpShare.advancedSettings);
			let errors = "";
			if ((errors = this.validate()) !== "") {
				alert("Applying share failed:\n" + errors);
				return;
			}
			this.$emit("apply-share", {
				...this.tmpShare,
				windowsAcls: this.tmpShare.windowsAcls ? "yes" : "no",
				guestOk: this.tmpShare.guestOk ? "yes" : "no",
				readOnly: this.tmpShare.readOnly ? "yes" : "no",
				browseable: this.tmpShare.browseable ? "yes" : "no",
			});
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
	},
	emits: [
		"apply-share",
		"hide"
	],
	components: {
		BlobList,
		DropdownSelector,
		Switch,
		SwitchDescription,
		SwitchGroup,
		SwitchLabel,
		ChevronDownIcon,
	}
}
</script>

<style scoped>
/* .editor {
	border: 1px solid lightgrey;
	border-radius
/* .editor {
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
} */
</style>
