import { type KeyValueData } from "@45drives/houston-common-lib";

export type SambaGlobalConfig = {
  logLevel: number;
  workgroup: string;
  serverString: string;
  advancedOptions: KeyValueData;
};

export type SambaShareConfig = {
  name: string;
  description: string;
  path: string;
  guestOk: boolean;
  readOnly: boolean;
  browseable: boolean;
  inheritPermissions: boolean;
  advancedOptions: KeyValueData;
};

export type SambaConfig = {
  global: SambaGlobalConfig;
  shares: SambaShareConfig[];
};

export const defaultSambaShareConfig = (name: string = "") => ({
  name,
  description: "",
  path: "",
  guestOk: false,
  browseable: true,
  readOnly: true,
  inheritPermissions: false,
  advancedOptions: {},
});

export const defaultSambaGlobalConfig = () => ({
  serverString: "Samba %v",
  logLevel: 0,
  workgroup: "WORKGROUP",
  advancedOptions: {},
});
