import {
  type SyntaxParser,
  IniSyntax,
  type Result,
  Ok,
  Err,
  ParsingError,
  Path,
  type KeyValueData,
  KVGrabber,
  KVGrabberCollection,
  StringToIntCaster,
  IdentityCaster,
  KVRemainderGrabber,
  type Transformer,
  IntToStringCaster,
  // type Option,
  Some,
  StringToBooleanCaster,
  BooleanToStringCaster,
  type IniConfigData,
} from "@45drives/houston-common-lib";
import type {
  SambaConfig,
  SambaGlobalConfig,
  SambaShareConfig,
  // ValidUsersGroupEntry,
  // ValidUsersUserEntry,
} from "./data-types";

const sambaStringToBooleanCaster = StringToBooleanCaster({
  truthyWords: ["yes", "1", "true"],
  falsyWords: ["no", "0", "false"],
  ignoreCase: true,
});
const sambaBooleanToStringCaster = BooleanToStringCaster("yes", "no");

export function SmbGlobalParser(): Transformer<SambaGlobalConfig, KeyValueData> {
  const parserFactory = (config: SambaGlobalConfig) =>
    KVGrabberCollection([
      KVGrabber(config, "logLevel", ["log level", "debuglevel"], StringToIntCaster()),
      KVGrabber(config, "serverString", ["server string"], IdentityCaster<string>()),
      KVGrabber(config, "workgroup", ["workgroup"], IdentityCaster<string>()),
      KVRemainderGrabber(config, "advancedOptions"),
    ]);
  const unparserFactory = (config: KeyValueData) =>
    KVGrabberCollection([
      KVGrabber(config, "log level", ["logLevel"], IntToStringCaster()),
      KVGrabber(config, "server string", ["serverString"], IdentityCaster<string>()),
      KVGrabber(config, "workgroup", ["workgroup"], IdentityCaster<string>()),
    ]);
  return {
    apply: (unparsed) => {
      const config = {
        serverString: "Samba %v",
        logLevel: 0,
        workgroup: "WORKGROUP",
        advancedOptions: {},
      };
      const grabber = parserFactory(config);
      Object.entries(unparsed).forEach(grabber);
      return Ok(config);
    },
    unapply: (parsed) => {
      const config: KeyValueData = {};
      const grabber = unparserFactory(config);
      Object.entries(parsed).forEach(grabber);
      return Ok({ ...config, ...parsed.advancedOptions });
    },
  };
}

export function SmbShareParser(name: string): Transformer<SambaShareConfig, KeyValueData> {
  const parserFactory = (config: SambaShareConfig) =>
    KVGrabberCollection([
      KVGrabber(config, "description", ["comment"], IdentityCaster<string>()),
      KVGrabber(config, "path", ["path", "directory"], (p: string) => Some(new Path(p))),
      // KVGrabber(config, "validUsers", ["valid users"], (str: string) =>
      //   Some(
      //     str.split(/\s*,\s*/g).map((userOrGroupSpec: string) => {
      //       const groupSpecRegex = /^[@&+]+(.*)$/;
      //       const groupMatch = userOrGroupSpec.match(groupSpecRegex);
      //       if (groupMatch) {
      //         return {
      //           name: groupMatch[1]!,
      //           groupSpecifier: groupMatch[0]!,
      //         };
      //       }
      //       return { name: userOrGroupSpec };
      //     })
      //   )
      // ),
      KVGrabber(config, "guestOk", ["guest ok"], sambaStringToBooleanCaster),
      KVGrabber(config, "readOnly", ["read only"], sambaStringToBooleanCaster),
      KVGrabber(config, "readOnly", ["write ok", "writeable", "writable"], (s) =>
        sambaStringToBooleanCaster(s).map((b) => !b)
      ),
      KVGrabber(config, "browseable", ["browseable", "browsable"], sambaStringToBooleanCaster),
      KVRemainderGrabber(config, "advancedOptions"),
    ]);
  return {
    apply: (unparsed: KeyValueData) => {
      const config = {
        name,
        description: "",
        path: new Path(""),
        // validUsers: [],
        guestOk: false,
        browseable: true,
        readOnly: true,
        advancedOptions: {},
      };
      const grabber = parserFactory(config);
      Object.entries(unparsed).forEach(grabber);
      return Ok(config);
    },
    unapply: (parsed: SambaShareConfig) => {
      return Ok({
        comment: parsed.description,
        path: parsed.path.path,
        "guest ok": sambaBooleanToStringCaster(parsed.guestOk).unwrap(),
        "read only": sambaBooleanToStringCaster(parsed.readOnly).unwrap(),
        browseable: sambaBooleanToStringCaster(parsed.browseable).unwrap(),
        ...parsed.advancedOptions,
      });
    },
  };
}

export function SmbConfParser(): SyntaxParser<SambaConfig> {
  const iniSyntax = IniSyntax({ paramIndent: "\t" });
  const globalParser = SmbGlobalParser();
  return {
    apply: (text) => {
      return iniSyntax.apply(text).andThen((iniData) => {
        const { global: globalIniData, ...sharesIniData } = iniData;
        return globalParser
          .apply(globalIniData ?? {})
          .andThen((global) => {
            try {
              return Ok({
                global,
                shares: Object.entries(sharesIniData).map(([name, shareIniObj]) =>
                  SmbShareParser(name)
                    .apply(shareIniObj)
                    .match({
                      ok: (v) => v,
                      err: (e) => {
                        throw e;
                      },
                    })
                ),
              });
            } catch (e) {
              if (e instanceof ParsingError) {
                return Err(e);
              }
              throw e;
            }
          });
      });
    },
    unapply: (config: SambaConfig) => {
      return globalParser
        .unapply(config.global)
        .andThen((global): Result<IniConfigData, ParsingError> => {
          try {
            const iniData: IniConfigData = {
              global,
            };
            config.shares.forEach((share) => {
              iniData[share.name] = SmbShareParser(share.name)
                .unapply(share)
                .match({
                  ok: (v) => v,
                  err: (e) => {
                    throw e;
                  },
                });
            });
            return Ok(iniData);
          } catch (e) {
            if (e instanceof ParsingError) {
              return Err(e);
            }
            throw e;
          }
        })
        .andThen(iniSyntax.unapply);
    },
  };
}
