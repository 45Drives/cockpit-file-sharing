<template>
	<div class="space-y-5 px-4 pb-4">
		<h3 v-if="!share">New Share</h3>
		<div>
			<label class="block text-sm font-medium">Share Name</label>
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
			<label class="block text-sm font-medium">Share Description</label>
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
			<label class="block text-sm font-medium">Path</label>
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
		<div
			class="space-y-5"
			:style="{ 'max-height': !shareWindowsAcls ? '500px' : '0', transition: !shareWindowsAcls ? 'max-height 0.5s ease-in' : 'max-height 0.5s ease-out', overflow: 'hidden' }"
		>
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
		</div>
		<div>
			<SwitchGroup as="div" class="flex items-center justify-between w-1/3">
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
			<SwitchGroup as="div" class="flex items-center justify-between w-1/3">
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
			<SwitchGroup as="div" class="flex items-center justify-between w-1/3">
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
		<div>
			<SwitchGroup as="div" class="flex items-center justify-between w-1/3">
				<span class="flex-grow flex flex-col">
					<SwitchLabel as="span" class="text-sm font-medium" passive>Windows ACLs</SwitchLabel>
					<SwitchDescription
						as="span"
						class="text-sm text-gray-500"
					>Administer Share Permissions from Windows</SwitchDescription>
				</span>
				<Switch
					v-model="shareWindowsAcls"
					@click="switchWindowsAcls(shareWindowsAcls)"
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
			<SwitchGroup as="div" class="flex items-center justify-between w-1/3">
				<span class="flex-grow flex flex-col">
					<SwitchLabel as="span" class="text-sm font-medium" passive>Shadow Copy</SwitchLabel>
					<SwitchDescription
						as="span"
						class="text-sm text-gray-500"
					>Expose Per-File Snapshots to Users</SwitchDescription>
				</span>
				<Switch
					v-model="shareShadowCopy"
					@click="switchShadowCopy(shareShadowCopy)"
					:class="[shareShadowCopy ? 'bg-red-600 dark:bg-red-700' : 'bg-neutral-200 dark:bg-neutral-900', 'relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-0']"
				>
					<span
						aria-hidden="true"
						:class="[shareShadowCopy ? 'translate-x-5' : 'translate-x-0', 'pointer-events-none inline-block h-5 w-5 rounded-full bg-white dark:bg-neutral-600 shadow transform ring-0 transition ease-in-out duration-200']"
					/>
				</Switch>
			</SwitchGroup>
		</div>
		<div>
			<SwitchGroup as="div" class="flex items-center justify-between w-1/3">
				<span class="flex-grow flex flex-col">
					<SwitchLabel as="span" class="text-sm font-medium" passive>MacOS Share</SwitchLabel>
					<SwitchDescription
						as="span"
						class="text-sm text-gray-500"
					>Optmize Share for MacOS</SwitchDescription>
				</span>
				<Switch
					v-model="shareMacOsShare"
					@click="switchMacOsShare(shareMacOsShare)"
					:class="[shareMacOsShare ? 'bg-red-600 dark:bg-red-700' : 'bg-neutral-200 dark:bg-neutral-900', 'relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-0']"
				>
					<span
						aria-hidden="true"
						:class="[shareMacOsShare ? 'translate-x-5' : 'translate-x-0', 'pointer-events-none inline-block h-5 w-5 rounded-full bg-white dark:bg-neutral-600 shadow transform ring-0 transition ease-in-out duration-200']"
					/>
				</Switch>
			</SwitchGroup>
		</div>
		<div>
			<SwitchGroup as="div" class="flex items-center justify-between w-1/3">
				<span class="flex-grow flex flex-col">
					<SwitchLabel as="span" class="text-sm font-medium" passive>Audit Logs</SwitchLabel>
					<SwitchDescription
						as="span"
						class="text-sm text-gray-500"
					>Turn on Audit Logging</SwitchDescription>
				</span>
				<Switch
					v-model="shareAuditLogs"
					@click="switchAuditLogs(shareAuditLogs)"
					:class="[shareAuditLogs ? 'bg-red-600 dark:bg-red-700' : 'bg-neutral-200 dark:bg-neutral-900', 'relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-0']"
				>
					<span
						aria-hidden="true"
						:class="[shareAuditLogs ? 'translate-x-5' : 'translate-x-0', 'pointer-events-none inline-block h-5 w-5 rounded-full bg-white dark:bg-neutral-600 shadow transform ring-0 transition ease-in-out duration-200']"
					/>
				</Switch>
			</SwitchGroup>
		</div>
		<div @click="showAdvanced = !showAdvanced">
			<label class="block text-sm font-medium cursor-pointer">
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
				@change="setAdvancedToggleStates"
				placeholder="key = value"
			/>
		</div>
		<div class="flex flex-row justify-end space-x-3">
			<button class="btn-primary" @click="cancel">Cancel</button>
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
		const tmpShare = reactive({});
		const showAdvanced = ref(false);
		const shareValidUsers = ref([]);
		const shareValidGroups = ref([]);
		const shareAdvancedSettingsStr = ref("");
		const shareWindowsAcls = ref(false);
		const shareShadowCopy = ref(false);
		const shareMacOsShare = ref(false);
		const shareAuditLogs = ref(false);

		const setAdvancedToggleStates = () => {
			shareWindowsAcls.value =
				/map acl inherit ?=/.test(shareAdvancedSettingsStr.value)
				&& /acl_xattr: ?ignore system acl ?=/.test(shareAdvancedSettingsStr.value)
				&& /vfs objects ?=.*acl_xattr.*/.test(shareAdvancedSettingsStr.value);
			shareShadowCopy.value =
				/shadow: ?snapdir ?=/.test(shareAdvancedSettingsStr.value)
				&& /shadow: ?sort ?=/.test(shareAdvancedSettingsStr.value)
				&& /shadow: ?format ?=/.test(shareAdvancedSettingsStr.value)
				&& /vfs objects ?=.*shadow_copy2/.test(shareAdvancedSettingsStr.value);
			shareMacOsShare.value =
				/fruit: ?encoding ?=/.test(shareAdvancedSettingsStr.value)
				&& /fruit: ?metadata ?=/.test(shareAdvancedSettingsStr.value)
				&& /fruit: ?zero_file_id ?=/.test(shareAdvancedSettingsStr.value)
				&& /fruit: ?nfs_aces ?=/.test(shareAdvancedSettingsStr.value)
				&& /vfs objects ?=.*catia/.test(shareAdvancedSettingsStr.value)
				&& /vfs objects ?=.*fruit/.test(shareAdvancedSettingsStr.value)
				&& /vfs objects ?=.*streams_xattr/.test(shareAdvancedSettingsStr.value);
			shareAuditLogs.value =
				/full_audit: ?priority ?=/.test(shareAdvancedSettingsStr.value)
				&& /full_audit: ?facility ?=/.test(shareAdvancedSettingsStr.value)
				&& /full_audit: ?success ?=/.test(shareAdvancedSettingsStr.value)
				&& /full_audit: ?failure ?=/.test(shareAdvancedSettingsStr.value)
				&& /full_audit: ?prefix ?=/.test(shareAdvancedSettingsStr.value)
				&& /vfs objects ?=.*full_audit/.test(shareAdvancedSettingsStr.value);
		}

		const tmpShareInit = () => {
			shareValidUsers.value = [];
			shareValidGroups.value = [];
			Object.assign(tmpShare, props.share
				? {
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
				})
			tmpShare["valid users"].split(/\s*,?\s+/).forEach((entity) => {
				if (entity.at(0) === '@')
					shareValidGroups.value.push(entity.substring(1));
				else if (entity)
					shareValidUsers.value.push(entity);
			});

			shareAdvancedSettingsStr.value = joinAdvancedSettings(tmpShare.advancedSettings);
			showAdvanced.value = Boolean(shareAdvancedSettingsStr.value);

			setAdvancedToggleStates();
		}

		tmpShareInit();

		// these switch methods were watch, but I don't want settings to be removed
		// when changing a line turns off the switch automatically through setAdvancedToggleStates
		const switchWindowsAcls = (value) => {
			if (value) {
				showAdvanced.value = true;
				if (/map acl inherit/.test(shareAdvancedSettingsStr.value))
					shareAdvancedSettingsStr.value = shareAdvancedSettingsStr.value.replace(/(?<=map acl inherit ?=).*/, " yes");
				else
					shareAdvancedSettingsStr.value += "\nmap acl inherit = yes";
				if (/acl_xattr:ignore system acl/.test(shareAdvancedSettingsStr.value))
					shareAdvancedSettingsStr.value = shareAdvancedSettingsStr.value.replace(/(?<=acl_xattr: ?ignore system acl ?=).*/, " yes");
				else
					shareAdvancedSettingsStr.value += "\nacl_xattr:ignore system acl = yes";
				if (/vfs objects/.test(shareAdvancedSettingsStr.value))
					shareAdvancedSettingsStr.value = shareAdvancedSettingsStr.value.replace(/(?<=vfs objects ?=)(?!.*acl_xattr.*)/, " acl_xattr ");
				else
					shareAdvancedSettingsStr.value += "\nvfs objects = acl_xattr";
			} else {
				shareAdvancedSettingsStr.value =
					shareAdvancedSettingsStr.value
						.replace(/map acl inherit ?= ?(yes|true|1)\n?/, "")
						.replace(/acl_xattr: ?ignore system acl ?= ?(yes|true|1)\n?/, "")
						.replace(/(?<=vfs objects ?=.*)acl_xattr ?/, "");
			}
			shareAdvancedSettingsStr.value = shareAdvancedSettingsStr.value.split('\n').filter((line) => line !== "").join('\n').replace(/[\t ]+/g, " ").replace(/\s+$/gm, "");
		};

		const switchShadowCopy = (value) => {
			if (value) {
				showAdvanced.value = true;
				if (!/shadow: ?snapdir/.test(shareAdvancedSettingsStr.value))
					shareAdvancedSettingsStr.value += "\nshadow:snapdir = .zfs/snapshot";
				if (!/shadow: ?sort/.test(shareAdvancedSettingsStr.value))
					shareAdvancedSettingsStr.value += "\nshadow:sort = desc";
				if (!/shadow: ?format/.test(shareAdvancedSettingsStr.value))
					shareAdvancedSettingsStr.value += "\nshadow:format = %Y-%m-%d-%H%M%S";
				if (/vfs objects/.test(shareAdvancedSettingsStr.value))
					shareAdvancedSettingsStr.value = shareAdvancedSettingsStr.value.replace(/(?<=vfs objects ?=)(?!.*shadow_copy2.*)/, " shadow_copy2 ");
				else
					shareAdvancedSettingsStr.value += "\nvfs objects = shadow_copy2";
			} else {
				shareAdvancedSettingsStr.value =
					shareAdvancedSettingsStr.value
						.replace(/shadow: ?snapdir ?=.*\n?/, "")
						.replace(/shadow: ?sort.*\n?/, "")
						.replace(/shadow: ?format.*\n?/, "")
						.replace(/(?<=vfs objects ?=.*)shadow_copy2 ?/, "");
			}
			shareAdvancedSettingsStr.value = shareAdvancedSettingsStr.value.split('\n').filter((line) => line !== "").join('\n').replace(/[\t ]+/g, " ").replace(/\s+$/gm, "");
		};

		const switchMacOsShare = (value) => {
			if (value) {
				showAdvanced.value = true;
				if (!/fruit: ?encoding/.test(shareAdvancedSettingsStr.value)) 1
				shareAdvancedSettingsStr.value += "\nfruit:encoding = native";
				if (!/fruit: ?metadata/.test(shareAdvancedSettingsStr.value))
					shareAdvancedSettingsStr.value += "\nfruit:metadata = stream";
				if (/fruit: ?zero_file_id/.test(shareAdvancedSettingsStr.value))
					shareAdvancedSettingsStr.value = shareAdvancedSettingsStr.value.replace(/(?<=fruit: ?zero_file_id ?=).*/, " yes");
				else
					shareAdvancedSettingsStr.value += "\nfruit:zero_file_id = yes";
				if (/fruit: ?nfs_aces/.test(shareAdvancedSettingsStr.value))
					shareAdvancedSettingsStr.value = shareAdvancedSettingsStr.value.replace(/(?<=fruit: ?nfs_aces ?=).*/, " no");
				else
					shareAdvancedSettingsStr.value += "\nfruit:nfs_aces = no";
				if (/vfs objects/.test(shareAdvancedSettingsStr.value))
					shareAdvancedSettingsStr.value =
						shareAdvancedSettingsStr.value
							.replace(/(?<=vfs objects ?=)(?!.*streams_xattr.*)/, " streams_xattr ")
							.replace(/(?<=vfs objects ?=)(?!.*fruit.*)/, " fruit ")
							.replace(/(?<=vfs objects ?=)(?!.*catia.*)/, " catia ");
				else
					shareAdvancedSettingsStr.value += "\nvfs objects = catia fruit streams_xattr";
			} else {
				shareAdvancedSettingsStr.value =
					shareAdvancedSettingsStr.value
						.replace(/fruit: ?encoding.*\n?/, "")
						.replace(/fruit: ?metadata.*\n?/, "")
						.replace(/fruit: ?zero_file_id.*\n?/, "")
						.replace(/fruit: ?nfs_aces.*\n?/, "")
						.replace(/(?<=vfs objects ?=.*)catia ?/, "")
						.replace(/(?<=vfs objects ?=.*)fruit ?/, "")
						.replace(/(?<=vfs objects ?=.*)streams_xattr ?/, "");
			}
			shareAdvancedSettingsStr.value = shareAdvancedSettingsStr.value.split('\n').filter((line) => line !== "").join('\n').replace(/[\t ]+/g, " ").replace(/\s+$/gm, "");
		};

		const switchAuditLogs = (value) => {
			if (value) {
				showAdvanced.value = true;
				if (!/full_audit: ?priority ?=/.test(shareAdvancedSettingsStr.value))
					shareAdvancedSettingsStr.value += "\nfull_audit:priority = notice";
				if (!/full_audit: ?facility ?=/.test(shareAdvancedSettingsStr.value))
					shareAdvancedSettingsStr.value += "\nfull_audit:facility = local5";
				if (!/full_audit: ?success ?=/.test(shareAdvancedSettingsStr.value))
					shareAdvancedSettingsStr.value += "\nfull_audit:success = connect disconnect mkdir rmdir read write rename";
				if (!/full_audit: ?failure ?=/.test(shareAdvancedSettingsStr.value))
					shareAdvancedSettingsStr.value += "\nfull_audit:failure = connect";
				if (!/full_audit: ?prefix ?=/.test(shareAdvancedSettingsStr.value))
					shareAdvancedSettingsStr.value += "\nfull_audit:prefix = %u|%I|%S";
				if (/vfs objects ?=/.test(shareAdvancedSettingsStr.value))
					shareAdvancedSettingsStr.value = shareAdvancedSettingsStr.value.replace(/(?<=vfs objects ?=)(?!.*full_audit.*)/, " full_audit ");
				else
					shareAdvancedSettingsStr.value += "\nvfs objects = full_audit";
			} else {
				shareAdvancedSettingsStr.value =
					shareAdvancedSettingsStr.value
						.replace(/full_audit: ?priority.*\n?/, "")
						.replace(/full_audit: ?facility.*\n?/, "")
						.replace(/full_audit: ?success.*\n?/, "")
						.replace(/full_audit: ?failure.*\n?/, "")
						.replace(/full_audit: ?prefix.*\n?/, "")
						.replace(/(?<=vfs objects ?=.*)full_audit ?/, "");
			}
			shareAdvancedSettingsStr.value = shareAdvancedSettingsStr.value.split('\n').filter((line) => line !== "").join('\n').replace(/[\t ]+/g, " ").replace(/\s+$/gm, "");
		};

		const apply = () => {
			tmpShare["valid users"] = shareWindowsAcls.value ? "" : [...shareValidGroups.value.sort().map(group => `@${group}`), ...shareValidUsers.value.sort()].join(" ");
			tmpShare.advancedSettings = splitAdvancedSettings(shareAdvancedSettingsStr.value);
			shareAdvancedSettingsStr.value = joinAdvancedSettings(tmpShare.advancedSettings);
			emit("apply-share", {
				...tmpShare,
				"guest ok": tmpShare["guest ok"] ? "yes" : "no",
				"read only": tmpShare["read only"] ? "yes" : "no",
				"browseable": tmpShare["browseable"] ? "yes" : "no",
			});
		};

		const cancel = () => {
			tmpShareInit();
			emit('hide');
		}

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

		watch(() => props.share, tmpShareInit, { lazy: false });

		return {
			tmpShare,
			showAdvanced,
			shareValidUsers,
			shareValidGroups,
			shareAdvancedSettingsStr,
			shareWindowsAcls,
			shareShadowCopy,
			shareMacOsShare,
			shareAuditLogs,
			setAdvancedToggleStates,
			switchWindowsAcls,
			switchShadowCopy,
			switchMacOsShare,
			switchAuditLogs,
			apply,
			cancel,
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
