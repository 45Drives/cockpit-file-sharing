import { type KeyValueData } from "@45drives/houston-common-lib";

export type SambaGlobalConfig = {
  logLevel: number;
  workgroup: string;
  serverString: string;
  advancedOptions: KeyValueData;
}

export type SambaShareConfig = {
  name: string;
  description: string;
  path: string;
  guestOk: boolean;
  readOnly: boolean;
  browseable: boolean;
  advancedOptions: KeyValueData;
}

export type SambaConfig = {
  global: SambaGlobalConfig;
  shares: SambaShareConfig[];
};
