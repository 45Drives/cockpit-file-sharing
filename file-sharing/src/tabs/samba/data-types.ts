import { Path, User, Group, type KeyValueData } from "@45drives/houston-common-lib";

export type SambaGlobalConfig = {
  logLevel: number;
  workgroup: string;
  serverString: string;
  advancedOptions: KeyValueData;
}

// export type ValidUsersUserEntry = {
//   name: string;
// };

// export type ValidUsersGroupEntry = ValidUsersUserEntry & {
//   groupSpecifier: "@" | "&" | "+" | "+&";
// };

export type SambaShareConfig = {
  name: string;
  description: string;
  path: Path;
  // validUsers: (ValidUsersUserEntry | ValidUsersGroupEntry)[];
  guestOk: boolean;
  readOnly: boolean;
  browseable: boolean;
  advancedOptions: KeyValueData;
}

export type SambaConfig = {
  global: SambaGlobalConfig;
  shares: SambaShareConfig[];
};
