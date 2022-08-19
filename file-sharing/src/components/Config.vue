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
	<button
		type="button"
		@click="show = true"
	>
		<CogIcon class="size-icon icon-default" />
	</button>
	<ModalPopup
		:showModal="show"
		headerText="File Sharing Settings"
		cancelText="Close"
		@apply="writeConfig"
		@cancel="hide"
		:disableContinue="noChanges"
	>
		<div class="flex flex-col items-stretch gap-content">
			<div class="text-header">Samba</div>
			<div>
				<label class="text-label block">
					Configuration Path
				</label>
				<input
					v-model="configTmp.samba.confPath"
					type="text"
					class="input-textlike w-full block"
					placeholder="default: /etc/samba/smb.conf"
				/>
			</div>
			<div class="text-header">NFS</div>
			<div>
				<label class="text-label block">
					Configuration Path
				</label>
				<input
					v-model="configTmp.nfs.confPath"
					type="text"
					class="input-textlike w-full block"
					placeholder="default: /etc/exports.d/cockpit-file-sharing.exports"
				/>
			</div>
		</div>
	</ModalPopup>
</template>

<script lang="ts">
import { reactive, ref, defineComponent, watch, computed } from 'vue';
import { CogIcon } from '@heroicons/vue/solid';
import ModalPopup from './ModalPopup.vue';

declare global {
	var cockpit: any = {};
}

interface FileSharingConfig {
	/**
	 * Samba-specific settings
	 */
	samba: {
		/**
		 * Path to smb.conf
		 */
		confPath: string;
	}
	/**
	 * NFS-specific settings
	 */
	nfs: {
		/**
		 * Path to cockpit-file-sharing.exports or equivalent
		 */
		confPath: string;
	}
}

function deepCopy<T>(obj: T): T {
	return JSON.parse(JSON.stringify(obj));
}

const assignConfig = (target: any, source: FileSharingConfig, defaults: FileSharingConfig): FileSharingConfig => {
	Object.assign(target, {
		samba: {
			confPath: source?.samba?.confPath || defaults.samba.confPath,
		},
		nfs: {
			confPath: source?.nfs?.confPath || defaults.nfs.confPath,
		}
	});
	return target as FileSharingConfig;
}

const configPath = "/etc/cockpit-file-sharing.conf.json";

const configFile = cockpit.file(configPath, {
	superuser: 'try',
	syntax: {
		parse: (str: string) => JSON.parse(str),
		stringify: (obj: any) => JSON.stringify(obj, null, 2),
	}
});

const configDefaults: FileSharingConfig = {
	samba: {
		confPath: "/etc/samba/smb.conf",
	},
	nfs: {
		confPath: "/etc/exports.d/cockpit-file-sharing.exports"
	}
};

const config: FileSharingConfig = reactive(deepCopy(configDefaults));

const loadConfig = (onDiskConfig: FileSharingConfig | null) => {
	if (onDiskConfig !== null) {
		assignConfig(config, onDiskConfig, configDefaults);
	}
}

configFile.watch(loadConfig);

export function useConfig() {
	return config;
}

export default defineComponent({
	setup() {
		const show = ref(false);
		const noChanges = computed(() => configTmp.nfs.confPath === config.nfs.confPath && configTmp.samba.confPath === config.samba.confPath);

		const configTmp: FileSharingConfig = reactive(deepCopy(configDefaults));

		const writeConfig = () => {
			assignConfig(config, configTmp, configDefaults);
			configFile.replace(config);
		}

		const hide = () => {
			show.value = false;
			configFile.read(); // trigger watch to reset fields
		}

		watch(config, () => {
			assignConfig(configTmp, config, configDefaults);
		});

		return {
			show,
			noChanges,
			configTmp,
			hide,
			writeConfig,
			config,
		}
	},
	components: {
		ModalPopup,
		CogIcon,
	}
})
</script>
