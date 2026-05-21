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
    /**
     * When true, hide every edit affordance in the tab (add/edit/delete/import).
     * Read-only operations (view, export) stay available. For deployments where
     * the config is owned externally (e.g. config-as-code, Ansible, manual edits
     * to /etc/samba/smb.conf) and Cockpit is only meant to visualize.
     */
    readOnly: boolean;
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
    /**
     * When true, hide every edit affordance in the tab (add/edit/delete/import).
     * Read-only operations (view, export) stay available. For deployments where
     * /etc/exports (or the configured file) is owned externally.
     */
    readOnly: boolean;
  };
  s3: {

    tabVisibility: TabVisibility;
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
    /**
     * When true, hide every edit affordance in the tab. iSCSI consists of many
     * sub-screens (portals, initiator groups, LUNs, CHAP, …); this flag gates
     * their primary add/edit/delete buttons at the screen level.
     */
    readOnly: boolean;
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
    readOnly: false,
  },
  nfs: {
    confPath: "/etc/exports.d/cockpit-file-sharing.exports",
    tabVisibility: "auto",
    readOnly: false,
  },
  s3: {
    tabVisibility: "auto",
  },
  iscsi: {
    // confPath: "/etc/scst/cockpit-iscsi.conf",
    confPath: "/etc/scst.conf",
    clusteredServerChecked: false,
    clusteredServer: false,
    subnetMask: 16,
    tabVisibility: "auto",
    readOnly: false,
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
            // `??` not `||`: false is the default + a valid user choice.
            readOnly: contents.samba?.readOnly ?? defaultSettings().samba.readOnly,
          },
          nfs: {
            confPath: contents.nfs?.confPath || defaultSettings().nfs.confPath,
            tabVisibility: contents.nfs?.tabVisibility || defaultSettings().nfs.tabVisibility,
            readOnly: contents.nfs?.readOnly ?? defaultSettings().nfs.readOnly,
          },
          s3: {
            tabVisibility: contents.s3?.tabVisibility || defaultSettings().s3.tabVisibility,
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
            readOnly: contents.iscsi?.readOnly ?? defaultSettings().iscsi.readOnly,
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
