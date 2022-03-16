<template>
	<div v-if="fatalError" class="absolute w-full h-full bg-white/50 dark:bg-black/50 z-50 px-60 pt-5">
		<div class="rounded-md bg-red-50 p-4 grow-0">
			<div class="flex">
				<div class="flex-shrink-0">
					<XCircleIcon class="h-5 w-5 text-red-400" aria-hidden="true" />
				</div>
				<div class="ml-3">
					<h3 class="text-sm font-medium text-red-800" :style="{'white-space': 'pre'}">{{fatalError}}</h3>
				</div>
			</div>
		</div>
	</div>
	<div class="max-w-7xl mx-auto sm:px-6 lg:px-8 space-y-8 py-8">
		<div class="card">
			<SambaGlobalManagement :globalConfig="globalConfig" :loaded="loaded" />
		</div>
		<div class="card">
			<SambaShareManagement
				:shares="shares"
				@refresh-shares="refresh"
				:groups="groups"
				:users="users"
				:loaded="loaded"
			/>
		</div>
	</div>
</template>

<script>
import { XCircleIcon } from "@heroicons/vue/solid";
import SambaShareManagement from "./SambaShareManagement.vue";
import SambaGlobalManagement from "./SambaGlobalManagement.vue";
import SambaUserManagement from "./SambaUserManagement.vue";
import useSpawn from "./UseSpawn";
import { ref, reactive, watch } from "vue";

const spawnOpts = {
	superuser: 'require',
	promise: true
}

export default {
	setup(props, ctx) {
		const shares = ref([]);
		const globalConfig = reactive({ advancedSettings: [] });
		const users = ref([]);
		const groups = ref([]);
		const loaded = ref(false);
		const fatalError = ref("");

		const parseNetConf = async () => {
			shares.value = [];
			globalConfig.advancedSettings = [];
			const simpleSettingsShare = [
				"comment",
				"path",
				"valid users",
				"guest ok",
				"read only",
				"browseable",
			];
			const simpleSettingsGlobal = [
				"server string",
				"workgroup",
				"log level",
			];
			const shareTemplate = {
				"name": "",
				"comment": "",
				"path": "",
				"valid users": "",
				"guest ok": "no",
				"read only": "no",
				"browseable": "yes",
				advancedSettings: []
			};
			let share = null;
			try {
				const netConfOutput = (await useSpawn(['net', 'conf', 'list'], spawnOpts)).stdout;
				let match;
				netConfOutput.split('\n').forEach((line) => {
					if ((match = line.match(/\[([^\]]+)]/))) {
						if (share && share !== globalConfig)
							shares.value.push({ ...share, advancedSettings: [...share.advancedSettings] });
						if (match[1] === 'global') {
							share = globalConfig;
						} else {
							share = { ...shareTemplate, advancedSettings: [...shareTemplate.advancedSettings] };
							share.name = match[1];
						}
					} else if ((match = line.match(/^([^=]+)=(.*)$/))) {
						let key = match[1].trim();
						let value = match[2].trim();
						if ((share === globalConfig && simpleSettingsGlobal.includes(key))
							|| (share !== globalConfig && simpleSettingsShare.includes(key)))
							share[key] = value;
						else
							share.advancedSettings.push(`${key} = ${value}`);
					}
				});
				if (share && share !== globalConfig)
					shares.value.push({ ...share, advancedSettings: [...share.advancedSettings] });
			} catch (state) {
				fatalError.value += "Error while getting shares:\n" + state.stderr + '\n';
			}
		};

		const getUsers = async () => {
			users.value = [];
			try {
				const passwdDB = (await useSpawn(['getent', 'passwd'], spawnOpts)).stdout;
				passwdDB.split('\n').forEach((record) => {
					const fields = record.split(':');
					const user = fields[0];
					const uid = fields[2];
					if (uid >= 1000)
						users.value.push(user);
				})
			} catch (state) {
				fatalError.value += "Error while getting users:\n" + state.stderr + '\n';
			}
		}

		const getGroups = async () => {
			groups.value = [];
			try {
				const groupDB = (await useSpawn(['getent', 'group'], spawnOpts)).stdout;
				groupDB.split('\n').forEach((record) => {
					const fields = record.split(':');
					const group = fields[0];
					const gid = fields[2]; ``
					if (gid >= 1000)
						groups.value.push(group);
				})
			} catch (state) {
				fatalError.value += "Error while getting groups:\n" + state.stderr + '\n';
			}
		}

		const refresh = async () => {
			loaded.value = false;
			let procs = [];
			procs.push(parseNetConf());
			procs.push(getUsers());
			procs.push(getGroups());
			for (let proc of procs)
				await proc;
			shares.value.sort((a, b) => a.name.localeCompare(b.name));
			loaded.value = true;
		};

		refresh();

		return {
			shares,
			globalConfig,
			users,
			groups,
			loaded,
			fatalError,
			parseNetConf,
			getUsers,
			getGroups,
			refresh,
		}
	},
	components: { SambaShareManagement, SambaGlobalManagement, SambaUserManagement, XCircleIcon }
}
</script>
