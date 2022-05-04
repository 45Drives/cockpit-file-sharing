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
	<div class="space-y-content text-base">
		<div class="text-header" v-if="!share">New Share</div>
		<div>
			<label class="block text-label">Share Name</label>
			<input
				type="text"
				name="name"
				class="w-full input-textlike"
				placeholder="A unique name for your share"
				v-model="tmpShare.name"
				:disabled="share"
				autocomplete="off"
			/>
			<div class="feedback-group" v-if="feedback.name">
				<ExclamationCircleIcon class="size-icon icon-error" />
				<span class="text-feedback text-error">{{ feedback.name }}</span>
			</div>
		</div>
		<div>
			<label class="block text-label">Share Description</label>
			<input
				type="text"
				name="description"
				class="w-full input-textlike"
				placeholder="Describe your share"
				v-model="tmpShare.comment"
			/>
		</div>
		<div>
			<label class="block text-label">Path</label>
			<input
				type="text"
				name="path"
				class="w-full input-textlike disabled:cursor-not-allowed"
				placeholder="Share path/directory"
				v-model="tmpShare.path"
				:disabled="share !== null"
			/>
			<div class="feedback-group" v-if="feedback.path">
				<ExclamationCircleIcon class="size-icon icon-error" />
				<span class="text-feedback text-error">{{ feedback.path }}</span>
			</div>
			<div v-else class="feedback-group">
				<ExclamationIcon v-if="!pathExists" class="size-icon icon-warning" />
				<span v-if="!pathExists" class="text-feedback text-warning">Path does not exist.</span>
				<button
					v-if="!pathExists"
					class="text-feedback text-warning underline"
					@click="dirPermissions.update"
				>Create now</button>
				<button
					v-else
					class="text-feedback text-primary"
					@click="dirPermissions.update"
				>Edit Permissions</button>
				<ModalPopup
					:showModal="dirPermissions.showModal"
					headerText="Share Directory Permissions"
					@apply="dirPermissions.applyCallback"
					@cancel="dirPermissions.cancelCallback"
				>
					<div class="flex flex-col space-y-content">
						<FileModeMatrix v-model="dirPermissions.mode" />
						<div>
							<label class="block text-sm font-medium">Owner</label>
							<select name="log-level" class="input-textlike" v-model="dirPermissions.owner">
								<option v-for="user in users" :value="user.user">{{ user.pretty }}</option>
							</select>
						</div>
						<div>
							<label class="block text-sm font-medium">Group</label>
							<select name="log-level" class="input-textlike" v-model="dirPermissions.group">
								<option v-for="group in groups" :value="group.group">{{ group.pretty }}</option>
							</select>
						</div>
					</div>
				</ModalPopup>
			</div>
			<div v-if="isCeph && cephNotRemounted && share !== null" class="feedback-group">
				<ExclamationIcon class="size-icon icon-warning" />
				<span class="text-feedback text-warning">Ceph filesystem not remounted at share.</span>
				<button
					class="text-feedback text-warning underline"
					@click="remountCeph()"
					:disabled="cephOptions.fixMountRunning"
				>Fix now</button>
				<InfoTip>
					When creating a Ceph share, a new filesystem mount point is created on top of the share directory.
					This is needed for Windows to properly report quotas through Samba.
				</InfoTip>
				<LoadingSpinner v-if="cephOptions.fixMountRunning" class="ml-2 size-icon" />
			</div>
		</div>
		<div v-if="isCeph && cephNotRemounted && share === null" class="flex flex-row items-center">
			<LabelledSwitch v-model="cephOptions.enableRemount">Enable Ceph remount</LabelledSwitch>
			<InfoTip>
				When creating a Ceph share, a new filesystem mount point is created on top of the share directory.
				This is needed for Windows to properly report quotas through Samba.
			</InfoTip>
		</div>
		<div v-if="isCeph">
			<label class="block text-label">Ceph Quota</label>
			<div class="relative rounded-md shadow-sm inline">
				<input
					type="number"
					class="pr-12 input-textlike"
					placeholder="0.00"
					v-model="cephOptions.quotaValue"
				/>
				<div class="absolute inset-y-0 right-0 flex items-center">
					<label class="sr-only">Unit</label>
					<select
						class="input-textlike border-transparent bg-transparent"
						v-model="cephOptions.quotaMultiplier"
					>
						<option :value="1024 ** 2">MiB</option>
						<option :value="1024 ** 3">GiB</option>
						<option :value="1024 ** 4">TiB</option>
					</select>
				</div>
			</div>
			<div class="feedback-group" v-if="feedback.cephQuota">
				<ExclamationCircleIcon class="size-icon icon-error" />
				<span class="text-feedback text-error">{{ feedback.cephQuota }}</span>
			</div>
		</div>
		<div v-if="isCeph">
			<label class="block text-label">Ceph Layout Pool</label>
			<select
				class="input-textlike disabled:cursor-not-allowed"
				v-model="cephOptions.layoutPool"
				:disabled="share !== null"
			>
				<option value>Select a Pool</option>
				<option v-for="(pool, index) in cephLayoutPools" :value="pool">{{ pool }}</option>
			</select>
		</div>
		<div
			class="space-y-content"
			:style="{ 'max-height': !shareWindowsAcls ? '500px' : '0', transition: !shareWindowsAcls ? 'max-height 0.5s ease-in' : 'max-height 0.5s ease-out', overflow: 'hidden' }"
		>
			<div>
				<label class="text-label flex flex-row space-x-2">
					<span>Valid Users</span>
					<InfoTip>By default, any user and group can join a share. If a "valid user" or "valid group" is added, it then acts as a whitelist.</InfoTip>
				</label>
				<PillList :list="shareValidUsers" @remove-item="removeValidUser" />
				<DropdownSelector :options="users" placeholder="Add User" @select="addValidUser" />
			</div>
			<div>
				<label class="block text-label">Valid Groups</label>
				<PillList :list="shareValidGroups" @remove-item="removeValidGroup" />
				<DropdownSelector :options="groups" placeholder="Add Group" @select="addValidGroup" />
			</div>
		</div>
		<div class="inline-flex flex-col items-stretch gap-content">
			<LabelledSwitch v-model="tmpShare['guest ok']">Guest OK</LabelledSwitch>
			<LabelledSwitch v-model="tmpShare['read only']">Read Only</LabelledSwitch>
			<LabelledSwitch v-model="tmpShare['browseable']">Browseable</LabelledSwitch>
			<LabelledSwitch v-model="shareWindowsAcls" @change="value => switchWindowsAcls(value)">
				Windows ACLS
				<template #description>Administer share permissions from Windows</template>
			</LabelledSwitch>
			<LabelledSwitch v-model="shareShadowCopy" @change="value => switchShadowCopy(value)">
				Shadow Copy
				<template #description>Expose per-file snapshots to users</template>
			</LabelledSwitch>
			<LabelledSwitch v-model="shareMacOsShare" @change="value => switchMacOsShare(value)">
				MacOS Share
				<template #description>Optimize share for MacOS</template>
			</LabelledSwitch>
			<LabelledSwitch v-model="shareAuditLogs" @change="value => switchAuditLogs(value)">
				Audit Logs
				<template #description>Turn on audit logging</template>
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
				name="advanced-settings"
				rows="4"
				v-model="shareAdvancedSettingsStr"
				class="w-full input-textlike"
				@change="setAdvancedToggleStates"
				placeholder="key = value"
			/>
		</div>
		<div class="button-group-row justify-end">
			<button class="btn btn-secondary" @click="cancel">Cancel</button>
			<button class="btn btn-primary" @click="apply" :disabled="!inputsValid">Confirm</button>
		</div>
		<ModalPopup
			:showModal="cephOptions.showMountOptionsModal"
			headerText="Ceph Remount Options"
			cancelText="Do not remount"
			@apply="cephOptions.mountOptionsApplyCallback"
			@cancel="cephOptions.mountOptionsCancelCallback"
		>
			<div
				class="block"
			>Could not automatically determine options for remounting Ceph at share point. Enter options below.</div>
			<input type="text" class="w-full input-textlike" v-model="cephOptions.mountOptions" />
		</ModalPopup>
	</div>
</template>

<script>
import PillList from "./PillList.vue";
import DropdownSelector from "./DropdownSelector.vue";
import { splitAdvancedSettings, joinAdvancedSettings, strToBool } from "../functions";
import { ChevronDownIcon, ExclamationCircleIcon, ExclamationIcon } from "@heroicons/vue/solid";
import { ref, reactive, watch, inject } from "vue";
import { useSpawn, errorStringHTML } from "@45drives/cockpit-helpers";
import ModalPopup from "./ModalPopup.vue";
import InfoTip from "./InfoTip.vue";
import FileModeMatrix from "./FileModeMatrix.vue";
import { notificationsInjectionKey } from "../keys";
import LabelledSwitch from "./LabelledSwitch.vue";
import { whitespaceDelimiterRegex } from "../regex";
import normalizePath from 'normalize-path';
import LoadingSpinner from "./LoadingSpinner.vue";

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
		const cephNotRemounted = ref(false);
		const cephOptions = reactive({
			quotaValue: 0,
			quotaMultiplier: 0,
			layoutPool: "",
			enableRemount: true,
			fixMountRunning: false,
			showMountOptionsModal: false,
			mountOptions: "name=samba,secretfile=/etc/ceph/samba.secret,_netdev",
			mountOptionsAsk: () => {
				return new Promise((resolve, reject) => {
					const respond = (handle, response) => {
						cephOptions.showMountOptionsModal = false;
						handle(response);
					}
					cephOptions.mountOptionsApplyCallback = () => respond(resolve, cephOptions.mountOptions);
					cephOptions.mountOptionsCancelCallback = () => respond(reject);
					cephOptions.showMountOptionsModal = true;
				});
			},
			mountOptionsApplyCallback: () => { },
			mountOptionsCancelCallback: () => { },
		});
		const inputsValid = ref(true);
		const pathExists = ref(false);
		const notifications = inject(notificationsInjectionKey);

		const feedback = reactive({});

		const dirPermissions = reactive({
			showModal: false,
			mode: 0o755,
			owner: 'root',
			group: 'root',
			resetNewDirSettings: async () => {
				try {
					const stat = (await useSpawn(['stat', '--format=%a:%U:%G', tmpShare.path], { superuser: 'try' }).promise()).stdout.trim().split(':');
					dirPermissions.mode = parseInt(stat[0], 8);
					dirPermissions.owner = stat[1];
					dirPermissions.group = stat[2];
				} catch (state) {
					dirPermissions.mode = 0o755;
					dirPermissions.owner = 'root';
					dirPermissions.group = 'root';
				}
			},
			update: async () => {
				try {
					if (/^(?:\/\.?\.?)+$/.test(tmpShare.path)) {
						notifications.value.constructNotification("Cannot Edit Permissions for /", "If you think you need to do this, you don't.", 'denied');
						return;
					}
					await dirPermissions.resetNewDirSettings();
					if (!await dirPermissions.waitForApply())
						return;
					await useSpawn(['mkdir', '-p', tmpShare.path], { superuser: 'try' }).promise();
					await useSpawn(['chown', dirPermissions.owner, tmpShare.path], { superuser: 'try' }).promise();
					await useSpawn(['chgrp', dirPermissions.group, tmpShare.path], { superuser: 'try' }).promise();
					await useSpawn(['chmod', dirPermissions.mode.toString(8), tmpShare.path], { superuser: 'try' }).promise();
					tmpShareUpdateCallback();
				} catch (state) {
					notifications.value.constructNotification("Failed to update directory permissions", errorStringHTML(state), 'error');
				}
			},
			waitForApply: () => {
				return new Promise((resolve, reject) => {
					dirPermissions.showModal = true;
					const respond = (result) => {
						dirPermissions.showModal = false;
						resolve(result);
					}
					dirPermissions.applyCallback = () => respond(true);
					dirPermissions.cancelCallback = () => respond(false);
				});
			},
			applyCallback: () => { },
			cancelCallback: () => {
				dirPermissions.showModal = false;
			}
		});

		const setAdvancedToggleStates = () => {
			shareWindowsAcls.value =
				/map acl inherit ?=/.test(shareAdvancedSettingsStr.value)
				&& /acl_xattr: ?ignore system acl ?=/.test(shareAdvancedSettingsStr.value)
				&& /vfs objects ?=.*acl_xattr.*/.test(shareAdvancedSettingsStr.value);
			shareShadowCopy.value =
				(/shadow: ?snapdir ?=/.test(shareAdvancedSettingsStr.value)
					&& /shadow: ?sort ?=/.test(shareAdvancedSettingsStr.value)
					&& /shadow: ?format ?=/.test(shareAdvancedSettingsStr.value)
					&& /vfs objects ?=.*shadow_copy2/.test(shareAdvancedSettingsStr.value))
				|| (isCeph.value
					&& /vfs objects ?=.*ceph_snapshots/.test(shareAdvancedSettingsStr.value))
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
				await useSpawn(['stat', tmpShare.path], { superuser: 'try' }).promise();
				pathExists.value = true;
			} catch {
				pathExists.value = false;
			}
		};

		const checkIfCeph = async () => {
			try {
				const cephXattr = (await useSpawn(['getfattr', '-n', 'ceph.dir.rctime', tmpShare.path]).promise()).stdout;
				if (cephXattr !== "") {
					isCeph.value = true;
				} else {
					isCeph.value = false;
				}
			} catch (state) {
				isCeph.value = false;
			}
		};

		const getCephQuota = async () => {
			try {
				const quotaBytes = Number((await useSpawn(['getfattr', '-n', 'ceph.quota.max_bytes', '--only-values', '--absolute-names', tmpShare.path], { superuser: 'try' }).promise()).stdout);
				if (quotaBytes !== 0) {
					const base = 1024;
					let exp = Math.floor(Math.log(quotaBytes) / Math.log(base));
					exp = Math.min(Math.max(exp, 2), 4); // limit to MiB - TiB
					cephOptions.quotaMultiplier = base ** exp;
					cephOptions.quotaValue = quotaBytes / cephOptions.quotaMultiplier;
					return;
				}
			} catch (err) { /* ignore */ }
			cephOptions.quotaValue = 0;
			cephOptions.quotaMultiplier = 1024 ** 3; // default to GiB
		}

		const getCephLayoutPool = async () => {
			try {
				cephOptions.layoutPool = (await useSpawn(['getfattr', '-n', 'ceph.dir.layout.pool', '--only-values', '--absolute-names', tmpShare.path], { superuser: 'try' }).promise()).stdout;
			} catch (err) {
				cephOptions.layoutPool = "";
			}
		};

		const tmpShareInit = async () => {
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
				}
			);
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

			await checkIfCeph();
			if (isCeph.value) {
				getCephQuota();
				getCephLayoutPool();
			}

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
			const addShadowCopy = () => {
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
			};
			const removeShadowCopy = () => {
				shareAdvancedSettingsStr.value =
					shareAdvancedSettingsStr.value
						.replace(/shadow: ?snapdir ?=.*\n?/, "")
						.replace(/shadow: ?sort.*\n?/, "")
						.replace(/shadow: ?format.*\n?/, "")
						.replace(/(?<=vfs objects ?=.*)shadow_copy2 ?/, "");
			};
			const addCephShadowCopy = () => {
				if (/vfs objects/.test(shareAdvancedSettingsStr.value))
					shareAdvancedSettingsStr.value = shareAdvancedSettingsStr.value.replace(/(?<=vfs objects ?=)(?!.*ceph_snapshots.*)/, " ceph_snapshots ");
				else
					shareAdvancedSettingsStr.value += "\nvfs objects = ceph_snapshots";
			};
			const removeCephShadowCopy = () => {
				shareAdvancedSettingsStr.value =
					shareAdvancedSettingsStr.value
						.replace(/(?<=vfs objects ?=.*)ceph_snapshots ?/, "");
			};
			if (value) {
				showAdvanced.value = true;
				if (isCeph.value) {
					removeShadowCopy();
					addCephShadowCopy();
				} else {
					removeCephShadowCopy();
					addShadowCopy();
				}
			} else {
				removeShadowCopy();
				removeCephShadowCopy();
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

		const setCephQuota = async () => {
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
				notifications.value.constructNotification("Failed to set Ceph quota", errorStringHTML(state), 'error');
			}
		}

		const setCephLayoutPool = async () => {
			try {
				if (cephOptions.layoutPool) {
					await useSpawn(['setfattr', '-n', 'ceph.dir.layout.pool', '-v', cephOptions.layoutPool, tmpShare.path], { superuser: 'try' }).promise();
				}
				getCephLayoutPool();
			} catch (state) {
				notifications.value.constructNotification("Failed to set Ceph layout pool", errorStringHTML(state), 'error');
			}
		}

		const checkCephRemount = async () => {
			try {
				cephNotRemounted.value = !(new RegExp(`^${await normalizePath(tmpShare.path)}$`, 'mg')).test((await useSpawn(['df', '--output=target'], { superuser: 'try' }).promise()).stdout);
			} catch (state) {
				notifications.value.constructNotification("Failed to determine if Ceph was remounted", errorStringHTML(state), 'error');
				cephNotRemounted.value = true;
			}
		}

		const getCephMountOpts = async (mainFsMount) => {
			try {
				const regex = new RegExp(`\\s${mainFsMount}\\s`);
				const possibleMatches = (await cockpit.file('/etc/fstab', { superuser: 'try' }).read())
					.split('\n')
					.filter(line => regex.test(line));
				if (possibleMatches.length < 1)
					throw new Error("No matches in fstab");
				const opts = possibleMatches[0].split(whitespaceDelimiterRegex)[3];
				cephOptions.mountOptions = opts;
				if (possibleMatches.length > 1)
					throw new Error("Too many matches in fstab");
				return opts;
			} catch (error) {
				notifications.value.constructNotification("Failed to determine Ceph mount options", error.message, 'warning');
				try {
					return (await cephOptions.mountOptionsAsk());
				} catch {
					throw new Error("Cancelled by user");
				}
			}
		}

		const remountCeph = async () => {
			cephOptions.fixMountRunning = true;
			try {
				const systemdMountFile = `/etc/systemd/system/${tmpShare.path.substring(1).replace(/\//g, '-').replace(/[^A-Za-z0-9\-_]/g, '')}.mount`;
				const df = (await useSpawn(['df', '--output=source,target', tmpShare.path], { superuser: 'try' }).promise()).stdout.split('\n')[1];
				let mainFsSrc, mainFsTgt, remainder;
				[mainFsSrc, mainFsTgt, ...remainder] = df.split(whitespaceDelimiterRegex);
				if (await normalizePath(mainFsTgt) === await normalizePath(tmpShare.path))
					return;
				const fsLeaf = tmpShare.path.slice(mainFsTgt.length);
				const newFsSrc = (mainFsSrc + fsLeaf).replace(/\/+/, '/');
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
Description=share remount created by cockpit-file-sharing

[Mount]
What=${newFsSrc}
Where=${tmpShare.path}
LazyUnmount=true
Type=ceph
Options=${await getCephMountOpts(mainFsTgt)}

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
				notifications.value.constructNotification("Success", "Successfully set up Ceph remount for share", 'success');
			} catch (state) {
				notifications.value.constructNotification("Failed to set up Ceph systemd mount for share", errorStringHTML(state), 'error');
			} finally {
				cephOptions.fixMountRunning = false;
				checkCephRemount();
			}
		}

		const applyCeph = async (force = false) => {
			const procs = [];
			procs.push(setCephQuota());
			if (force || props.share === null) { // only run if creating new share
				procs.push(setCephLayoutPool());
				if (cephNotRemounted.value && cephOptions.enableRemount)
					procs.push(remountCeph());
			}
			await Promise.all(procs);
		}

		const removeCephMount = async () => {
			const isRemount = async (systemdMountFile, host) => {
				const opts = { superuser: 'try' };
				if (host)
					opts.host = host;
				const mountContent = await cockpit.file(systemdMountFile, opts).read();
				if (!mountContent)
					return false; // assuming mount unit file DNE, so not remount
				if (/share remount created by cockpit-file-sharing$/mg.test(mountContent))
					return true; // remount generated by cockpit-file-sharing
				return false; // not generated by cockpit-file-sharing
			}
			try {
				const systemdMountUnit = `${tmpShare.path.substring(1).replace(/\//g, '-').replace(/[^A-Za-z0-9\-_]/g, '')}.mount`;
				const systemdMountFile = `/etc/systemd/system/${systemdMountUnit}`;
				if (props.ctdbHosts?.length) {
					for (const host of props.ctdbHosts) {
						if (await isRemount(systemdMountFile, host)) {
							await useSpawn(['systemctl', 'disable', '--now', systemdMountUnit], { superuser: 'try', host }).promise();
							await cockpit.file(systemdMountFile, { superuser: 'try', host }).replace(null);
						}
					}
				} else {
					if (await isRemount(systemdMountFile)) {
						await useSpawn(['systemctl', 'disable', '--now', systemdMountUnit], { superuser: 'try' }).promise();
						await cockpit.file(systemdMountFile, { superuser: 'try' }).replace(null);
					}
				}
			} catch (state) {
				notifications.value.constructNotification("Failed to remove Ceph systemd mount for share", errorStringHTML(state), 'error');
			}
		}

		const apply = () => {
			tmpShare["valid users"] = shareWindowsAcls.value ? "" : [...shareValidGroups.value.map(group => `"@${group.group}"`).sort(), ...shareValidUsers.value.map(user => `"${user.user}"`).sort()].join(" ");
			tmpShare.advancedSettings = splitAdvancedSettings(shareAdvancedSettingsStr.value);
			shareAdvancedSettingsStr.value = joinAdvancedSettings(tmpShare.advancedSettings);
			emit("applyShare", {
				...tmpShare,
				"guest ok": tmpShare["guest ok"] ? "yes" : "no",
				"read only": tmpShare["read only"] ? "yes" : "no",
				"browseable": tmpShare["browseable"] ? "yes" : "no",
			}, applyCeph);
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

		const validateInputs = () => {
			let result = true;
			let invalidChars;

			if (!tmpShare.name) {
				feedback.name = "Share name is required.";
				result = false;
			} else if (props.share === null && props.shares.find(share => share.name.toUpperCase() === tmpShare.name.toUpperCase())) {
				feedback.name = "Share exists.";
				result = false;
			} else if (invalidChars = tmpShare.name.match(/[%<>*?|/\\+=;:",]/g)) {
				feedback.name = `Invalid character${invalidChars.length ? 's' : ''}: ${invalidChars.filter((c, i, a) => a.indexOf(c) === i).map(c => `'${c}'`).join(', ')}`;
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

		const tmpShareUpdateCallback = async (current, old) => {
			validateInputs();
			if (old === undefined || current.path !== old.path) {
				await checkIfExists();
				if (pathExists.value) {
					dirPermissions.resetNewDirSettings();
				}
				const lastIsCeph = isCeph.value;
				await checkIfCeph();
				if (isCeph.value !== lastIsCeph) {
					switchShadowCopy();
				}
				if (isCeph.value) {
					await getCephQuota();
					await getCephLayoutPool();
					await checkCephRemount();
				}
			}
		}

		watch(() => props.share, () => {
			tmpShareInit();
		}, { lazy: false });

		watch(() => ({ ...tmpShare }), async (current, old) => {
			tmpShareUpdateCallback(current, old);
		}, { deep: true, immediate: true });

		watch(() => ({ ...cephOptions }), async (current, old) => {
			validateInputs();
		});

		return {
			dirPermissions,
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
			pathExists,
			isCeph,
			cephNotRemounted,
			checkIfCeph,
			cephOptions,
			inputsValid,
			feedback,
			remountCeph,
			applyCeph,
			removeCephMount,
			tmpShareInit,
		};
	},
	components: {
		PillList,
		DropdownSelector,
		ChevronDownIcon,
		ExclamationCircleIcon,
		ExclamationIcon,
		ModalPopup,
		InfoTip,
		FileModeMatrix,
		LabelledSwitch,
		LoadingSpinner,
	},
	emits: [
		'applyShare',
		'hide',
	],
}
</script>

<style scoped>
input::-webkit input::-webkit-outer-spin-button,
input::-webkit-inner-spin-button {
	-webkit-appearance: none;
	margin: 0;
}

input[type="number"] {
	-moz-appearance: textfield;
}
</style>
