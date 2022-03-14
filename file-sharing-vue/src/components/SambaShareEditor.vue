<template>
	<div class="space-y-5 px-4 pb-4">
		<h3 v-if="!share">New Share</h3>
		<div>
			<label for="name" class="block text-sm font-medium">Share Name</label>
			<div class="mt-1">
				<input
					type="text"
					name="name"
					id="name"
					class="shadow-sm focus:border-gray-500 focus:ring-0 focus:outline-none block w-full sm:text-sm border-gray-300 dark:border-gray-700 dark:bg-neutral-800 rounded-md disabled:bg-neutral-100 disabled:text-gray-500 disabled:cursor-not-allowed"
					placeholder="Share Name"
					v-model="tmpShare.name"
					:disabled="share"
				/>
			</div>
		</div>
		<div>
			<label for="description" class="block text-sm font-medium">Share Description</label>
			<div class="mt-1">
				<input
					type="text"
					name="description"
					id="description"
					class="shadow-sm focus:border-gray-500 focus:ring-0 focus:outline-none block w-full sm:text-sm border-gray-300 dark:border-gray-700 dark:bg-neutral-800 rounded-md"
					placeholder="Share Name"
					v-model="tmpShare.comment"
				/>
			</div>
		</div>
		<div>
			<label for="path" class="block text-sm font-medium">Path</label>
			<div class="mt-1">
				<input
					type="text"
					name="path"
					id="path"
					class="shadow-sm focus:border-gray-500 focus:ring-0 focus:outline-none block w-full sm:text-sm border-gray-300 dark:border-gray-700 dark:bg-neutral-800 rounded-md"
					placeholder="Share Path/Directory"
					v-model="tmpShare.path"
				/>
			</div>
		</div>
		<div>
			<label class="block text-sm font-medium">Valid Users</label>
			<PillList :list="shareValidUsers" @remove-item="removeValidUser" />
			<DropdownSelector :options="users" placeholder="Add User" @select="addValidUser" />
		</div>
		<div>
			<label class="block text-sm font-medium">Valid Groups</label>
			<PillList :list="shareValidGroups" @remove-item="removeValidGroup" />
			<DropdownSelector :options="groups" placeholder="Add Group" @select="addValidGroup" />
		</div>
		<div>
			<SwitchGroup as="div" class="flex items-center justify-between w-full">
				<span class="flex-grow flex flex-col">
					<SwitchLabel as="span" class="text-sm font-medium" passive>Windows ACLs</SwitchLabel>
					<!-- <SwitchDescription
						as="span"
						class="text-sm text-gray-500"
					>Nulla amet tempus sit accumsan. Aliquet turpis sed sit lacinia.</SwitchDescription>-->
				</span>
				<Switch
					v-model="shareWindowsAcls"
					:class="[shareWindowsAcls ? 'bg-red-600 dark:bg-red-700' : 'bg-neutral-200 dark:bg-neutral-900', 'relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-0']"
				>
					<span
						aria-hidden="true"
						:class="[shareWindowsAcls ? 'translate-x-5' : 'translate-x-0', 'pointer-events-none inline-block h-5 w-5 rounded-full bg-white dark:bg-neutral-600 shadow transform ring-0 transition ease-in-out duration-200']"
					/>
				</Switch>
			</SwitchGroup>
		</div>
		<div>
			<SwitchGroup as="div" class="flex items-center justify-between w-full">
				<span class="flex-grow flex flex-col">
					<SwitchLabel as="span" class="text-sm font-medium" passive>Guest OK</SwitchLabel>
					<!-- <SwitchDescription
						as="span"
						class="text-sm text-gray-500"
					>Allow guests in share.</SwitchDescription>-->
				</span>
				<Switch
					v-model="tmpShare['guest ok']"
					:class="[tmpShare['guest ok'] ? 'bg-red-600 dark:bg-red-700' : 'bg-neutral-200 dark:bg-neutral-900', 'relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-0']"
				>
					<span
						aria-hidden="true"
						:class="[tmpShare['guest ok'] ? 'translate-x-5' : 'translate-x-0', 'pointer-events-none inline-block h-5 w-5 rounded-full bg-white dark:bg-neutral-600 shadow transform ring-0 transition ease-in-out duration-200']"
					/>
				</Switch>
			</SwitchGroup>
		</div>
		<div>
			<SwitchGroup as="div" class="flex items-center justify-between w-full">
				<span class="flex-grow flex flex-col">
					<SwitchLabel as="span" class="text-sm font-medium" passive>Read Only</SwitchLabel>
					<!-- <SwitchDescription
						as="span"
						class="text-sm text-gray-500"
					>Make share read only.</SwitchDescription>-->
				</span>
				<Switch
					v-model="tmpShare['read only']"
					:class="[tmpShare['read only'] ? 'bg-red-600 dark:bg-red-700' : 'bg-neutral-200 dark:bg-neutral-900', 'relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-0']"
				>
					<span
						aria-hidden="true"
						:class="[tmpShare['read only'] ? 'translate-x-5' : 'translate-x-0', 'pointer-events-none inline-block h-5 w-5 rounded-full bg-white dark:bg-neutral-600 shadow transform ring-0 transition ease-in-out duration-200']"
					/>
				</Switch>
			</SwitchGroup>
		</div>
		<div>
			<SwitchGroup as="div" class="flex items-center justify-between w-full">
				<span class="flex-grow flex flex-col">
					<SwitchLabel as="span" class="text-sm font-medium" passive>Browseable</SwitchLabel>
					<!-- <SwitchDescription
						as="span"
						class="text-sm text-gray-500"
					>Allow browsing of share.</SwitchDescription>-->
				</span>
				<Switch
					v-model="tmpShare.browseable"
					:class="[tmpShare.browseable ? 'bg-red-600 dark:bg-red-700' : 'bg-neutral-200 dark:bg-neutral-900', 'relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-0']"
				>
					<span
						aria-hidden="true"
						:class="[tmpShare.browseable ? 'translate-x-5' : 'translate-x-0', 'pointer-events-none inline-block h-5 w-5 rounded-full bg-white dark:bg-neutral-600 shadow transform ring-0 transition ease-in-out duration-200']"
					/>
				</Switch>
			</SwitchGroup>
		</div>
		<div @click="showAdvanced = !showAdvanced">
			<label for="advanced-settings" class="block text-sm font-medium cursor-pointer">
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
				class="shadow-sm focus:border-gray-500 focus:ring-0 focus:outline-none block w-1/2 sm:text-sm border-gray-300 dark:border-gray-700 dark:bg-neutral-800 rounded-md"
			/>
		</div>
		<div class="flex flex-row justify-end space-x-3">
			<button class="btn-primary" @click="$emit('hide')">Cancel</button>
			<button class="btn-green" @click="apply">Confirm</button>
		</div>
	</div>
</template>

<script>
import PillList from "./PillList.vue";
import DropdownSelector from "./DropdownSelector.vue";
import { splitAdvancedSettings, joinAdvancedSettings, strToBool } from "../functions";
import { Switch, SwitchDescription, SwitchGroup, SwitchLabel } from '@headlessui/vue'
import { ChevronDownIcon } from "@heroicons/vue/solid";
import { ref, reactive, watch } from "vue";
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
	setup(props, { emit }) {
		const tmpShare = reactive(props.share ? {
				...props.share,
				"guest ok": strToBool(props.share?.["guest ok"]),
				"read only": strToBool(props.share?.["read only"]),
				"browseable": strToBool(props.share?.["browseable"])
			}
			: {
				"name": "",
				"comment": "",
				"path": "",
				"valid users": "",
				"guest ok": false,
				"read only": false,
				"browseable": true,
				advancedSettings: []
			});
		const showAdvanced = ref(false);
		const shareValidUsers = ref([]);
		const shareValidGroups = ref([]);
		const shareAdvancedSettingsStr = ref("");
		const shareWindowsAcls = ref(false);

		tmpShare["valid users"].split(/\s*,?\s+/).forEach((entity) => {
			if (entity.at(0) === '@')
				shareValidGroups.value.push(entity.substring(1));
			else if (entity)
				shareValidUsers.value.push(entity);
		});

		shareAdvancedSettingsStr.value = joinAdvancedSettings(tmpShare.advancedSettings);
		shareWindowsAcls.value = /map acl inherit = (yes|true|1)/.test(shareAdvancedSettingsStr.value)
			&& /acl_xattr:ignore system acl = (yes|true|1)/.test(shareAdvancedSettingsStr.value)
			&& /vfs objects = .*acl_xattr.*/.test(shareAdvancedSettingsStr.value);

		watch(shareWindowsAcls, (value, oldValue) => {
			if (value) {
				showAdvanced.value = true;
				if (/map acl inherit/.test(shareAdvancedSettingsStr.value))
					shareAdvancedSettingsStr.value = shareAdvancedSettingsStr.value.replace(/(?<=map acl inherit = ).*/, "yes");
				else
					shareAdvancedSettingsStr.value += "\nmap acl inherit = yes";
				if (/acl_xattr:ignore system acl/.test(shareAdvancedSettingsStr.value))
					shareAdvancedSettingsStr.value = shareAdvancedSettingsStr.value.replace(/(?<=acl_xattr:ignore system acl = ).*/, "yes");
				else
					shareAdvancedSettingsStr.value += "\nacl_xattr:ignore system acl = yes";
				if (/vfs objects/.test(shareAdvancedSettingsStr.value))
					shareAdvancedSettingsStr.value = shareAdvancedSettingsStr.value.replace(/(?<=vfs objects = )(?!.*acl_xattr.*)/, "acl_xattr ");
				else
					shareAdvancedSettingsStr.value += "\nvfs objects = acl_xattr";
			} else {
				shareAdvancedSettingsStr.value = shareAdvancedSettingsStr.value.replace(/map acl inherit = .*/, "");
				shareAdvancedSettingsStr.value = shareAdvancedSettingsStr.value.replace(/acl_xattr:ignore system acl = .*/, "");
				shareAdvancedSettingsStr.value = shareAdvancedSettingsStr.value.replace(/(?<=vfs objects =.*)acl_xattr ?(?=.*)/, "");
			}
			shareAdvancedSettingsStr.value = shareAdvancedSettingsStr.value.split('\n').filter((line) => line !== "").join('\n');
		}, {lazy: false});

		const apply = () => {
			tmpShare["valid users"] = [...shareValidGroups.value.sort().map(group => `@${group}`), ...shareValidUsers.value.sort()].join(" ");
			tmpShare.advancedSettings = splitAdvancedSettings(shareAdvancedSettingsStr.value);
			shareAdvancedSettingsStr.value = joinAdvancedSettings(tmpShare.advancedSettings);
			emit("apply-share", {
				...tmpShare,
				"guest ok": tmpShare["guest ok"] ? "yes" : "no",
				"read only": tmpShare["read only"] ? "yes" : "no",
				"browseable": tmpShare["browseable"] ? "yes" : "no",
			});
		};

		const addValidUser = (user) => {
			shareValidUsers.value = [...new Set([...shareValidUsers.value, user])];
		};

		const removeValidUser = (user) => {
			shareValidUsers.value = shareValidUsers.value.filter((a) => a !== user);
		};

		const addValidGroup = (group) => {
			shareValidGroups.value = [...new Set([...shareValidGroups.value, group])];
		};

		const removeValidGroup = (group) => {
			shareValidGroups.value = shareValidGroups.value.filter((a) => a !== group);
		};

		return {
			tmpShare,
			showAdvanced,
			shareValidUsers,
			shareValidGroups,
			shareAdvancedSettingsStr,
			shareWindowsAcls,
			apply,
			addValidUser,
			removeValidUser,
			addValidGroup,
			removeValidGroup,
		};
	},
	components: {
		PillList,
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
