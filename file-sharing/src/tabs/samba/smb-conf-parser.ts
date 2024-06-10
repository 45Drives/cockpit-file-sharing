import {
  type SyntaxParser,
  IniSyntax,
  type KeyValueData,
  KVGrabber,
  KVGrabberCollection,
  StringToIntCaster,
  IdentityCaster,
  KVRemainderGrabber,
  type Transformer,
  IntToStringCaster,
  StringToBooleanCaster,
  BooleanToStringCaster,
  ParsingError,
} from "@45drives/houston-common-lib";
import {
  defaultSambaGlobalConfig,
  defaultSambaShareConfig,
  type SambaConfig,
  type SambaGlobalConfig,
  type SambaShareConfig,
} from "./data-types";
import { Result, ok, err } from "neverthrow";

const sambaStringToBooleanCaster = StringToBooleanCaster({
  truthyWords: ["yes", "1", "true"],
  falsyWords: ["no", "0", "false"],
  ignoreCase: true,
});
const sambaBooleanToStringCaster = BooleanToStringCaster("yes", "no");

export function SmbGlobalParser(): Transformer<SambaGlobalConfig, KeyValueData> {
  return {
    apply: (unparsed) => {
      const config = defaultSambaGlobalConfig();
      Object.entries(unparsed).forEach(
        KVGrabberCollection([
          KVGrabber(config, "logLevel", ["log level", "debuglevel"], StringToIntCaster()),
          KVGrabber(config, "serverString", ["server string"], IdentityCaster<string>()),
          KVGrabber(config, "workgroup", ["workgroup"], IdentityCaster<string>()),
          KVRemainderGrabber(config, "advancedOptions"),
        ])
      );
      return ok(config);
    },
    unapply: (parsed) => {
      const config: KeyValueData = {};
      Object.entries(parsed).forEach(
        KVGrabberCollection([
          KVGrabber(config, "log level", ["logLevel"], IntToStringCaster()),
          KVGrabber(config, "server string", ["serverString"], IdentityCaster<string>()),
          KVGrabber(config, "workgroup", ["workgroup"], IdentityCaster<string>()),
        ])
      );
      return ok({ ...config, ...parsed.advancedOptions });
    },
  };
}

export function SmbShareParser(name: string): Transformer<SambaShareConfig, KeyValueData> {
  return {
    apply: (unparsed: KeyValueData) => {
      const config = defaultSambaShareConfig(name);
      const grabbers = KVGrabberCollection([
        KVGrabber(config, "description", ["comment"], IdentityCaster<string>()),
        KVGrabber(config, "path", ["path", "directory"], IdentityCaster<string>()),
        KVGrabber(config, "guestOk", ["guest ok"], sambaStringToBooleanCaster),
        KVGrabber(config, "readOnly", ["read only"], sambaStringToBooleanCaster),
        KVGrabber(config, "readOnly", ["write ok", "writeable", "writable"], (s) =>
          sambaStringToBooleanCaster(s).map((b) => !b)
        ),
        KVGrabber(config, "browseable", ["browseable", "browsable"], sambaStringToBooleanCaster),
        KVGrabber(
          config,
          "inheritPermissions",
          ["inherit permissions"],
          sambaStringToBooleanCaster
        ),
        KVRemainderGrabber(config, "advancedOptions"),
      ]);
      if (
        !Object.entries(unparsed)
          .map(grabbers)
          .every((grabbed) => grabbed)
      ) {
        return err(new ParsingError("KeyValue pair of Samba share INI data not grabbed!"));
      }
      return ok(config);
    },
    unapply: (parsed: SambaShareConfig) => {
      const config: KeyValueData = {};
      const grabbers = KVGrabberCollection([
        KVGrabber(config, "comment", ["description"], IdentityCaster<string>()),
        KVGrabber(config, "path", ["path"], IdentityCaster<string>()),
        KVGrabber(config, "guest ok", ["guestOk"], sambaBooleanToStringCaster),
        KVGrabber(config, "read only", ["readOnly"], sambaBooleanToStringCaster),
        KVGrabber(config, "browseable", ["browseable"], sambaBooleanToStringCaster),
        KVGrabber(
          config,
          "inherit permissions",
          ["inheritPermissions"],
          sambaBooleanToStringCaster
        ),
      ]);
      if (
        !Object.entries(parsed)
          .filter(([key, _]) => !["advancedOptions", "name"].includes(key))
          .map(grabbers)
          .every((grabbed) => grabbed)
      ) {
        return err(new ParsingError("KeyValue pair of SambaShareConfig not grabbed!"));
      }
      return ok({ ...config, ...parsed.advancedOptions });
    },
  };
}

export function SmbConfParser(): SyntaxParser<SambaConfig> {
  const iniSyntax = IniSyntax({ paramIndent: "\t" });
  const globalParser = SmbGlobalParser();
  return {
    apply: (text) => {
      return iniSyntax.apply(text).andThen(({ global: globalIni, ...sharesIni }) => {
        return globalParser
          .apply(globalIni ?? {})
          .andThen((global) =>
            Result.combine(
              Object.entries(sharesIni).map(([name, shareIni]) =>
                SmbShareParser(name).apply(shareIni)
              )
            ).map((shares) => ({ global, shares }))
          );
      });
    },
    unapply: (config: SambaConfig) => {
      return globalParser
        .unapply(config.global)
        .andThen((globalIni) => {
          return Result.combine(
            config.shares.map((share) =>
              SmbShareParser(share.name)
                .unapply(share)
                .map((shareIni): [string, KeyValueData] => [share.name, shareIni])
            )
          ).map((shareEntriesIni) => ({
            global: globalIni,
            ...Object.fromEntries(shareEntriesIni),
          }));
        })
        .andThen(iniSyntax.unapply);
    },
  };
}
