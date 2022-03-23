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
					autocomplete="off"
				/>
			</div>
			<div
				class="mt-2 text-sm text-red-600 flex flex-row justify-start items-center space-x-1"
				v-if="feedback.name"
			>
				<ExclamationCircleIcon class="w-5 h-5 inline" />
				<span>{{ feedback.name }}</span>
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
					class="shadow-sm focus:border-gray-500 focus:ring-0 focus:outline-none block w-full sm:text-sm border-gray-300 dark:border-gray-700 dark:bg-neutral-800 rounded-md disabled:bg-neutral-100 disabled:text-gray-500 disabled:cursor-not-allowed"
					placeholder="Share Path/Directory"
					v-model="tmpShare.path"
					:disabled="share !== null"
				/>
			</div>
			<div
				class="mt-2 text-sm text-red-600 flex flex-row justify-start items-center space-x-1"
				v-if="feedback.path"
			>
				<ExclamationCircleIcon class="w-5 h-5 inline" />
				<span>{{ feedback.path }}</span>
			</div>
			<div
				v-if="!pathExists && !feedback.path"
				class="mt-2 text-sm text-orange-500 flex flex-row justify-start items-center space-x-1"
			>
				<ExclamationIcon class="w-5 h-5 inline-block" />
				<span>Path does not exist.</span>
				<button class="underline" @click="makeDir">Create now</button>
			</div>
		</div>
		<div v-if="isCeph">
			<label class="block text-sm font-medium">Ceph Share Mount Options</label>
			<div class="mt-1">
				<input
					type="text"
					name="path"
					id="path"
					class="shadow-sm focus:border-gray-500 focus:ring-0 focus:outline-none block w-full sm:text-sm border-gray-300 dark:border-gray-700 dark:bg-neutral-800 rounded-md disabled:bg-neutral-100 disabled:text-gray-500 disabled:cursor-not-allowed"
					placeholder="Share Path/Directory"
					v-model="cephOptions.mountOptions"
					:disabled="share !== null"
				/>
			</div>
			<div
				class="mt-2 text-sm text-red-600 flex flex-row justify-start items-center space-x-1"
				v-if="feedback.cephMountOptions"
			>
				<ExclamationCircleIcon class="w-5 h-5 inline" />
				<span>{{ feedback.cephMountOptions }}</span>
			</div>
			<div class="mt-2 text-sm text-gray-500 flex flex-row justify-start items-center space-x-1">
				<InformationCircleIcon class="w-5 h-5 inline-block shrink-0" />
				<span>
					When creating a Ceph share, a new filesystem mount point is created on top of the share directory.
					This is needed for Windows to properly report quotas through Samba.
				</span>
			</div>
		</div>
		<div v-if="isCeph">
			<label class="block text-sm font-medium">Ceph Quota</label>
			<div class="mt-1 relative rounded-md shadow-sm">
				<input
					type="number"
					class="focus:ring-0 focus:border-gray-500 block w-full pr-12 sm:text-sm border-gray-300 rounded-md dark:border-gray-700 dark:bg-neutral-800"
					placeholder="0.00"
					v-model="cephOptions.quotaValue"
				/>
				<div class="absolute inset-y-0 right-0 flex items-center">
					<label class="sr-only">Unit</label>
					<select
						class="focus:ring-0 focus:border-gray-500 h-full py-0 pl-2 pr-7 border-transparent bg-transparent text-gray-500 sm:text-sm rounded-md"
						v-model="cephOptions.quotaMultiplier"
					>
						<option :value="1024 ** 2">MiB</option>
						<option :value="1024 ** 3">GiB</option>
						<option :value="1024 ** 4">TiB</option>
					</select>
				</div>
			</div>
			<div
				class="mt-2 text-sm text-red-600 flex flex-row justify-start items-center space-x-1"
				v-if="feedback.cephQuota"
			>
				<ExclamationCircleIcon class="w-5 h-5 inline" />
				<span>{{ feedback.cephQuota }}</span>
			</div>
		</div>
		<div v-if="isCeph">
			<label class="block text-sm font-medium">Ceph Layout Pool</label>
			<select
				class="mt-1 block pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-0 dark:border-gray-700 dark:bg-neutral-800 focus:border-gray-500 sm:text-sm rounded-md disabled:bg-neutral-100 disabled:text-gray-500 disabled:cursor-not-allowed"
				v-model="cephOptions.layoutPool"
				:disabled="share !== null"
			>
				<option value>Select a Pool</option>
				<option v-for="(pool, index) in cephLayoutPools" :value="pool">{{ pool }}</option>
			</select>
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
			<SwitchGroup as="div" class="flex items-center justify-between w-1/3 mobile:w-full">
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
			<SwitchGroup as="div" class="flex items-center justify-between w-1/3 mobile:w-full">
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
			<SwitchGroup as="div" class="flex items-center justify-between w-1/3 mobile:w-full">
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
			<SwitchGroup as="div" class="flex items-center justify-between w-1/3 mobile:w-full">
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
			<SwitchGroup as="div" class="flex items-center justify-between w-1/3 mobile:w-full">
				<span class="flex-grow flex flex-col">
					<SwitchLabel as="span" class="text-sm font-medium" passive>Shadow Copy</SwitchLabel>
					<SwitchDescription as="span" class="text-sm text-gray-500">Expose Per-File Snapshots to Users</SwitchDescription>
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
			<SwitchGroup as="div" class="flex items-center justify-between w-1/3 mobile:w-full">
				<span class="flex-grow flex flex-col">
					<SwitchLabel as="span" class="text-sm font-medium" passive>MacOS Share</SwitchLabel>
					<SwitchDescription as="span" class="text-sm text-gray-500">Optmize Share for MacOS</SwitchDescription>
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
			<SwitchGroup as="div" class="flex items-center justify-between w-1/3 mobile:w-full">
				<span class="flex-grow flex flex-col">
					<SwitchLabel as="span" class="text-sm font-medium" passive>Audit Logs</SwitchLabel>
					<SwitchDescription as="span" class="text-sm text-gray-500">Turn on Audit Logging</SwitchDescription>
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
			<button class="btn btn-secondary" @click="cancel">Cancel</button>
			<button class="btn btn-primary" @click="apply" :disabled="!inputsValid">Confirm</button>
		</div>
	</div>
</template>

<script>
import PillList from "./PillList.vue";
import DropdownSelector from "./DropdownSelector.vue";
import { splitAdvancedSettings, joinAdvancedSettings, strToBool } from "../functions";
import { Switch, SwitchDescription, SwitchGroup, SwitchLabel } from '@headlessui/vue'
import { ChevronDownIcon, ExclamationCircleIcon, ExclamationIcon, InformationCircleIcon } from "@heroicons/vue/solid";
import { ref, reactive, watch } from "vue";
import useSpawn from "./UseSpawn";
export default {
	props: {
		share: {
			type: Object,
			required: false,
			default: null
		},
		users: Array[Object],
		groups: Array[Object],
		ctdbHosts: Array[String],
		cephLayoutPools: Array[String],
		modalPopup: Object,
		shares: Array[Object],
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
		const isCeph = ref(false);
		const cephOptions = reactive({
			quotaValue: 0,
			quotaMultiplier: 0,
			layoutPool: "",
			mountOptions: "name=samba,secretfile=/etc/ceph/samba.secret,_netdev",
		});
		const inputsValid = ref(true);
		const pathExists = ref(false);

		const feedback = reactive({});

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

		const checkIfExists = async () => {
			try {
				await useSpawn(['ls', tmpShare.path], { superuser: 'try' }).promise();
				pathExists.value = true;
				return;
			} catch { }
			pathExists.value = false;
		};

		const checkIfCeph = async () => {
			try {
				const cephXattr = (await useSpawn(['getfattr', '-n', 'ceph.dir.rctime', tmpShare.path]).promise()).stdout;
				if (cephXattr !== "") {
					isCeph.value = true;
					return;
				}
			} catch (state) { }
			isCeph.value = false;
		};

		const getCephQuota = async () => {
			try {
				const quotaBytes = Number((await useSpawn(['getfattr', '-n', 'ceph.quota.max_bytes', '--only-values', '--absolute-names', tmpShare.path], { superuser: 'try', err: 'message' }).promise()).stdout);
				if (quotaBytes !== 0) {
					const base = 1024;
					let exp = Math.floor(Math.log(quotaBytes) / Math.log(base));
					exp = Math.min(Math.max(exp, 2), 4); // limit to MiB - TiB
					cephOptions.quotaMultiplier = base ** exp;
					cephOptions.quotaValue = quotaBytes / cephOptions.quotaMultiplier;
					return;
				}
			} catch (err) { console.error(err) }
			cephOptions.quotaValue = 0;
			cephOptions.quotaMultiplier = 1024 ** 3; // default to GiB
		}

		const getCephLayoutPool = async () => {
			try {
				cephOptions.layoutPool = (await useSpawn(['getfattr', '-n', 'ceph.dir.layout.pool', '--only-values', '--absolute-names', tmpShare.path], { superuser: 'try', err: 'message' }).promise()).stdout;
				return;
			} catch (err) { console.error(err) }
			cephOptions.layoutPool = "";
		};

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
			tmpShare["valid users"].match(/(?:[^\s"]+|"[^"]*")+/g)?.map(entity => entity.replace(/^"/, '').replace(/"$/, '')).forEach((entity) => {
				if (entity.at(0) === '@') {
					const groupName = entity.substring(1);
					shareValidGroups.value.push(props.groups.find(group => group.group === groupName) ?? { group: groupName, domain: false, pretty: groupName });
				} else if (entity) {
					shareValidUsers.value.push(props.users.find(user => user.user === entity) ?? { user: entity, domain: false, pretty: entity });
				}
			});

			shareAdvancedSettingsStr.value = joinAdvancedSettings(tmpShare.advancedSettings);
			showAdvanced.value = Boolean(shareAdvancedSettingsStr.value);

			setAdvancedToggleStates();

			checkIfCeph().then(() => {
				if (isCeph.value) {
					getCephQuota();
					getCephLayoutPool();
				}
			})
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

		const applyCeph = async (force = false) => {
			try {
				const quotaBytes = Math.ceil(cephOptions.quotaValue * cephOptions.quotaMultiplier);
				if (quotaBytes) {
					// set quota
					await useSpawn(['setfattr', '-n', 'ceph.quota.max_bytes', '-v', quotaBytes.toString(), tmpShare.path], { superuser: 'try' }).promise();
				} else {
					// remove quota
					try {
						await useSpawn(['setfattr', '-x', 'ceph.quota.max_bytes', tmpShare.path], { superuser: 'try' }).promise();
					} catch { /* ignore failure if xattr DNE */ }
				}
				getCephQuota();
			} catch (state) {
				console.error(state);
			}

			if (force || props.share === null) { // only run if creating new share
				try {
					if (cephOptions.layoutPool) {
						await useSpawn(['setfattr', '-n', 'ceph.dir.layout.pool', '-v', cephOptions.layoutPool, tmpShare.path], { superuser: 'try' }).promise();
					}
					getCephLayoutPool();
				} catch (state) {
					console.error(state);
				}
				try {
					const systemdMountFile = `/etc/systemd/system/${tmpShare.path.substring(1).replace(/\//g, '-').replace(/[^A-Za-z0-9\-_]/g, '')}.mount`;
					const df = (await useSpawn(['df', '--output=source,target', tmpShare.path], { superuser: 'try' }).promise()).stdout.split('\n')[1];
					const rootFsSrc = ':' + df.split(' ')[0].split(/:(?=[^:]+$)/)[1];
					const rootFsTgt = df.split(/\s+/)[1]; // split at first space
					const fsLeaf = tmpShare.path.slice(rootFsTgt.length);
					const systemdMountContents =
						`[Unit]
DefaultDependencies=no
After=remote-fs-pre.target
After=network.target
Wants=network.target
After=network-online.target
Wants=network-online.target
Conflicts=umount.target
Before=umount.target
Before=ctdb.service
Description=share mount created by cockpit-file-sharing

[Mount]
What=${rootFsSrc + fsLeaf}
Where=${tmpShare.path}
LazyUnmount=true
Type=ceph
Options=${cephOptions.mountOptions}

[Install]
WantedBy=remote-fs.target
`
					if (props.ctdbHosts?.length) {
						for (const host of props.ctdbHosts) {
							await cockpit.file(systemdMountFile, { superuser: 'try', host }).replace(systemdMountContents);
							await useSpawn(['systemctl', 'enable', '--now', systemdMountFile], { superuser: 'try', host }).promise();
						}
					} else {
						await cockpit.file(systemdMountFile, { superuser: 'try' }).replace(systemdMountContents);
						await useSpawn(['systemctl', 'enable', '--now', systemdMountFile], { superuser: 'try' }).promise();
					}
				} catch (state) {
					console.error(state);
				}
			}
		}

		const removeCephMount = async () => {
			try {
				const systemdMountUnit = `${tmpShare.path.substring(1).replace(/\//g, '-').replace(/[^A-Za-z0-9\-_]/g, '')}.mount`;
				for (const host of props.ctdbHosts) {
					await useSpawn(['systemctl', 'disable', '--now', systemdMountUnit], { superuser: 'try', host }).promise();
					await cockpit.file(systemdMountUnit, { superuser: 'try', host }).replace(null);
				}
			} catch (state) {
				console.error(state);
			}
		}

		const apply = () => {
			tmpShare["valid users"] = shareWindowsAcls.value ? "" : [...shareValidGroups.value.map(group => `"@${group.group}"`).sort(), ...shareValidUsers.value.map(user => `"${user.user}"`).sort()].join(" ");
			tmpShare.advancedSettings = splitAdvancedSettings(shareAdvancedSettingsStr.value);
			shareAdvancedSettingsStr.value = joinAdvancedSettings(tmpShare.advancedSettings);
			emit("apply-share", {
				...tmpShare,
				"guest ok": tmpShare["guest ok"] ? "yes" : "no",
				"read only": tmpShare["read only"] ? "yes" : "no",
				"browseable": tmpShare["browseable"] ? "yes" : "no",
			});
			if (isCeph.value)
				applyCeph();
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

		const makeDir = async () => {
			try {
				await useSpawn(['mkdir', '-p', tmpShare.path], { superuser: 'try' }).promise();
				await checkIfExists();
				await checkIfCeph();
				if (isCeph.value)
					await getCephQuota();
			} catch (status) {
				await props.modalPopup.alert("Failed to make directory", status.stderr, { danger: true });
			}
		}

		const validateInputs = () => {
			let result = true;

			if (!tmpShare.name) {
				feedback.name = "Share name is required.";
				result = false;
			} else if (props.share === null && props.shares.find(share => share.name.toUpperCase() === tmpShare.name.toUpperCase())) {
				feedback.name = "Share exists.";
				result = false;
			} else {
				feedback.name = "";
			}

			if (!tmpShare.path) {
				feedback.path = "Share path is required.";
				result = false;
			} else if (!/^\//.test(tmpShare.path)) {
				feedback.path = "Share path must be absolute.";
				result = false;
			} else {
				feedback.path = "";
			}

			if (isCeph.value) {
				if (!/^\d+(?:\.\d*)?$/.test(cephOptions.quotaValue)) {
					feedback.cephQuota = "Invalid number format.";
					result = false;
				} else {
					feedback.cephQuota = "";
				}
			}

			inputsValid.value = result;
		}

		watch(() => props.share, () => {
			tmpShareInit();
		}, { lazy: false });

		watch(() => ({ ...tmpShare }), async (current, old) => {
			validateInputs();
			if (old === undefined || current.path !== old.path) {
				await checkIfExists();
				await checkIfCeph();
				if (isCeph.value) {
					await getCephQuota();
					await getCephLayoutPool();
				}
			}
		}, { deep: true, immediate: true });

		watch(() => ({ ...cephOptions }), async (current, old) => {
			validateInputs();
		});

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
			makeDir,
			pathExists,
			isCeph,
			checkIfCeph,
			cephOptions,
			inputsValid,
			feedback,
			applyCeph,
			removeCephMount,
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
		ExclamationCircleIcon,
		ExclamationIcon,
		InformationCircleIcon,
	}
}
</script>

<style scoped>
input::-webkit-outer-spin-button,
input::-webkit-inner-spin-button {
	-webkit-appearance: none;
	margin: 0;
}

input[type="number"] {
	-moz-appearance: textfield;
}
</style>
