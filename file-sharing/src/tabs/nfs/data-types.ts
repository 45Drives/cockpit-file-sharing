import { Maybe, Some, None } from "monet";
import { RegexSnippets } from "@45drives/houston-common-lib";

export interface INFSClientOption<T> {
  value: T;
  configValue(overrideNoDefault?: boolean): Maybe<string>;
}

export interface INFSClientOptionCtor<T> {
  new (value?: T): INFSClientOption<T>;
  fromString(s: string): Maybe<INFSClientOption<T>>;
}

export function NFSBooleanOption<TrueString extends string, FalseString extends string>(
  trueString: TrueString | [TrueString, ...TrueString[]],
  falseString: FalseString | [FalseString, ...FalseString[]],
  defaultString: TrueString | FalseString,
  defaultRequiredInConfig: boolean = false
): INFSClientOptionCtor<boolean> {
  const trueStrings = [trueString].flat() as [TrueString, ...TrueString[]];
  const falseStrings = [falseString].flat() as [FalseString, ...FalseString[]];
  trueString = trueStrings[0] as TrueString;
  falseString = falseStrings[0] as FalseString;
  const defaultValue = defaultString === trueString;
  const opt = class implements INFSClientOption<boolean> {
    public value: boolean;
    constructor(value: boolean = defaultValue) {
      this.value = value;
    }
    toString() {
      return this.value ? trueString : falseString;
    }
    configValue(overrideNoDefault: boolean = false): Maybe<TrueString | FalseString> {
      const result = this.toString();
      if (defaultRequiredInConfig || (result !== defaultString && !overrideNoDefault)) {
        return Some(result);
      }
      return None();
    }
    static fromString(s: string): Maybe<INFSClientOption<boolean>> {
      if (trueStrings.includes(s as TrueString)) {
        return Some(new opt(true));
      }
      if (falseStrings.includes(s as FalseString)) {
        return Some(new opt(false));
      }
      return None();
    }
  };
  return opt;
}

export function NFSOptionWithArgument(
  key: string | [string, ...string[]]
): INFSClientOptionCtor<string | undefined> {
  const keys = [key].flat() as [string, ...string[]];
  key = keys[0];
  const opt = class implements INFSClientOption<string | undefined> {
    public value: string | undefined;
    constructor(value: string | undefined = undefined) {
      this.value = value;
    }
    configValue(_?: boolean): Maybe<string> {
      return Maybe.fromEmpty(this.value).map((value) => `${key}=${value}`);
    }
    static fromString(s: string): Maybe<INFSClientOption<string | undefined>> {
      const [keyToken, valueToken] = s.split(RegexSnippets.keyValueSplitter);
      return Maybe.fromEmpty(keyToken)
        .filter((k) => keys.includes(k))
        .flatMap(() => Maybe.fromEmpty(valueToken).map((value) => new opt(value)));
    }
  };
  return opt;
}

export function NFSOptionWithOptionalArgument(
  key: string | [string, ...string[]]
): INFSClientOptionCtor<string | undefined> {
  const keys = [key].flat() as [string, ...string[]];
  key = keys[0];
  const Parent = NFSOptionWithArgument(key);
  const opt = class extends Parent {
    configValue(_?: boolean): Maybe<string> {
      return super.configValue().orElse(Maybe.fromUndefined(this.value).map(() => key));
    }
    static fromString(s: string): Maybe<INFSClientOption<string | undefined>> {
      if (s.includes("=")) {
        return Parent.fromString(s);
      }
      if (keys.includes(s)) {
        return Some(new opt(""));
      }
      return None();
    }
  };
  return opt;
}

export const NFSClientOptionsCtors = {
  secure: NFSBooleanOption("secure", "insecure", "secure"),
  rw: NFSBooleanOption("rw", "ro", "ro"),
  async: NFSBooleanOption("async", "sync", "sync", true),
  no_wdelay: NFSBooleanOption("no_wdelay", "wdelay", "wdelay"),
  nohide: NFSBooleanOption("nohide", "hide", "hide"),
  crossmnt: NFSBooleanOption("crossmnt", "", ""),
  no_subtree_check: NFSBooleanOption("no_subtree_check", "subtree_check", "no_subtree_check", true),
  insecure_locks: NFSBooleanOption(
    ["insecure_locks", "no_auth_nlm"],
    ["auth_nlm", "secure_locks"],
    "auth_nlm"
  ),
  no_acl: NFSBooleanOption("no_acl", "", ""),
  mountpoint: NFSOptionWithOptionalArgument(["mountpoint", "mp"]),
  fsid: NFSOptionWithArgument("fsid"),
  refer: NFSOptionWithArgument("refer"),
  replicas: NFSOptionWithArgument("replicas"),
  root_squash: NFSBooleanOption("root_squash", "no_root_squash", "root_squash"),
  all_squash: NFSBooleanOption("all_squash", "no_all_squash", "no_all_squash"),
  anonuid: NFSOptionWithArgument("anonuid"),
  anongid: NFSOptionWithArgument("anongid"),
};

export type NFSClientOptions = {
  [Prop in keyof typeof NFSClientOptionsCtors]: InstanceType<(typeof NFSClientOptionsCtors)[Prop]>;
};

export function defaultNFSClientOptions(): NFSClientOptions {
  return Object.fromEntries(
    Object.entries(NFSClientOptionsCtors).map(([key, ctor]) => [key, new ctor()])
  ) as NFSClientOptions;
}

export type NFSExportClient = {
  host: string;
  settings: NFSClientOptions;
};

export type NFSExport = {
  path: string;
  defaultClientSettings: NFSClientOptions;
  clients: NFSExportClient[];
  comment: string;
};

export function defaultNFSExport(): NFSExport {
  return {
    path: "",
    defaultClientSettings: defaultNFSClientOptions(),
    clients: [],
    comment: "",
  };
}
