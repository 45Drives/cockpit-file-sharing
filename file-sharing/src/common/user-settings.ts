import { computed, ref, watch } from "vue";

export type UserSettings = {
  /**
   * Samba-specific settings
   */
  samba: {
    /**
     * Path to smb.conf
     */
    confPath: string;
  };
  /**
   * NFS-specific settings
   */
  nfs: {
    /**
     * Path to cockpit-file-sharing.exports or equivalent
     */
    confPath: string;
  };
  /**
   * Include users and groups with uid and gid from 1 to 999
   */
  includeSystemAccounts: boolean;
};

const defaultSettings = (): UserSettings => ({
  samba: {
    confPath: "/etc/samba/smb.conf",
  },
  nfs: {
    confPath: "/etc/exports.d/cockpit-file-sharing.exports",
  },
  includeSystemAccounts: false,
});

const configPath = "/etc/cockpit-file-sharing.conf.json";

const configFile = cockpit.file(configPath, {
  superuser: "try",
  syntax: JSON,
});

const config = ref(defaultSettings());

configFile.watch(
  (contents: Partial<UserSettings> | null) => {
    if (contents === null) {
      return;
    }
    config.value = {
      samba: {
        confPath: contents.samba?.confPath || defaultSettings().samba.confPath,
      },
      nfs: {
        confPath: contents.nfs?.confPath || defaultSettings().nfs.confPath,
      },
      includeSystemAccounts:
        contents.includeSystemAccounts ?? defaultSettings().includeSystemAccounts,
    };
  },
  { read: true }
);

const computedSettingsRef = computed({
  get: () => config.value,
  set: (newConfig) => configFile.replace(newConfig),
});

export const useUserSettings = () => computedSettingsRef;
