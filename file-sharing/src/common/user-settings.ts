import { computed, ref, type Ref, type WritableComputedRef } from "vue";

export type TabVisibility = "auto" | "always" | "never";

export type UserSettings = {
  /**
   * Samba-specific settings
   */
  samba: {
    /**
     * Path to smb.conf
     */
    confPath: string;
    tabVisibility: TabVisibility;
  };
  /**
   * NFS-specific settings
   */
  nfs: {
    /**
     * Path to cockpit-file-sharing.exports or equivalent
     */
    confPath: string;
    tabVisibility: TabVisibility;
  };
  s3: {

    tabVisibility: TabVisibility;
  };
  /**
   * Connected-clients tab settings
   */
  connectedClients: {
    tabVisibility: TabVisibility;
    /** Auto-refresh interval in seconds. */
    refreshIntervalSeconds: number;
    /** Whether to push toast notifications when clients connect or disconnect between polls. */
    notifyOnChange: boolean;
  };
  /**
   * iSCSI-specific settings
   */
  iscsi: {
    /**
     * Path to iSCSI configuration path.
     */
    confPath: string;
    clusteredServerChecked: boolean;
    clusteredServer: boolean;
    subnetMask: number;
    tabVisibility: TabVisibility;
  };
 
  /**
   * Include users and groups with uid and gid from 1 to 999
   */
  includeSystemAccounts: boolean;
  /**
   * Fetch users and groups from domain
   */
  includeDomainAccounts: boolean;
};

const defaultSettings = (): UserSettings => ({
  samba: {
    confPath: "/etc/samba/smb.conf",
    tabVisibility: "auto",
  },
  nfs: {
    confPath: "/etc/exports.d/cockpit-file-sharing.exports",
    tabVisibility: "auto",
  },
  s3: {
    tabVisibility: "auto",
  },
  connectedClients: {
    tabVisibility: "auto",
    refreshIntervalSeconds: 5,
    notifyOnChange: true,
  },
  iscsi: {
    // confPath: "/etc/scst/cockpit-iscsi.conf",
    confPath: "/etc/scst.conf",
    clusteredServerChecked: false,
    clusteredServer: false,
    subnetMask: 16,
    tabVisibility: "auto",
  },
  includeSystemAccounts: false,
  includeDomainAccounts: false,
});

const configPath = "/etc/cockpit-file-sharing.conf.json";

const configFile = cockpit.file(configPath, {
  superuser: "try",
  syntax: JSON,
});

const config = ref(defaultSettings());

const configFileReadPromise = new Promise<Ref<UserSettings>>((resolve) => {
  configFile.watch(
    (contents: Partial<UserSettings> | null) => {
      if (contents !== null) {
        config.value = {
          samba: {
            confPath: contents.samba?.confPath || defaultSettings().samba.confPath,
            tabVisibility: contents.samba?.tabVisibility || defaultSettings().samba.tabVisibility,
          },
          nfs: {
            confPath: contents.nfs?.confPath || defaultSettings().nfs.confPath,
            tabVisibility: contents.nfs?.tabVisibility || defaultSettings().nfs.tabVisibility,
          },
          s3: {
            tabVisibility: contents.s3?.tabVisibility || defaultSettings().s3.tabVisibility,
          },
          connectedClients: {
            tabVisibility:
              contents.connectedClients?.tabVisibility ||
              defaultSettings().connectedClients.tabVisibility,
            // `??` not `||` here and below: 0 / false are valid user choices
            // (even if not currently exposed in the UI), don't overwrite with default.
            refreshIntervalSeconds:
              contents.connectedClients?.refreshIntervalSeconds ??
              defaultSettings().connectedClients.refreshIntervalSeconds,
            notifyOnChange:
              contents.connectedClients?.notifyOnChange ??
              defaultSettings().connectedClients.notifyOnChange,
          },
          iscsi: {
            // confPath: contents.iscsi?.confPath || defaultSettings().iscsi.confPath,
            confPath: defaultSettings().iscsi.confPath,
            clusteredServer:
              contents.iscsi?.clusteredServer || defaultSettings().iscsi.clusteredServer,
            clusteredServerChecked:
              contents.iscsi?.clusteredServerChecked ??
              defaultSettings().iscsi.clusteredServerChecked,
            subnetMask: contents.iscsi?.subnetMask || defaultSettings().iscsi.subnetMask,
            tabVisibility: contents.iscsi?.tabVisibility || defaultSettings().iscsi.tabVisibility,
          },
          includeSystemAccounts:
            contents.includeSystemAccounts ?? defaultSettings().includeSystemAccounts,
          includeDomainAccounts:
            contents.includeDomainAccounts ?? defaultSettings().includeDomainAccounts,
        };
      }
      resolve(config);
    },
    { read: true }
  );
});

const computedSettingsRef = computed({
  get: () => config.value,
  set: (newConfig) => configFile.replace(newConfig),
});

export function useUserSettings(waitUntilRead?: false): WritableComputedRef<UserSettings>;
export function useUserSettings(waitUntilRead: true): Promise<WritableComputedRef<UserSettings>>;
export function useUserSettings(waitUntilRead: boolean = false) {
  return waitUntilRead
    ? configFileReadPromise.then(() => computedSettingsRef)
    : computedSettingsRef;
}
