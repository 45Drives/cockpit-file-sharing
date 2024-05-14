import { SmbGlobalParser, SmbShareParser, SmbConfParser } from "@/tabs/samba/smb-conf-parser";
import { Path, type KeyValueData } from "@45drives/houston-common-lib";
import type { SambaConfig, SambaGlobalConfig, SambaShareConfig } from "@/tabs/samba/data-types";
import { ok } from "neverthrow";
import { suite, test, expect } from "vitest";

suite("Samba", () => {
  suite("Config Parser", () => {
    const globalParser = SmbGlobalParser();
    suite("SmbGlobalParser", () => {
      test("default values", () => {
        expect(globalParser.apply({})).toEqual(
          ok({
            logLevel: 0,
            serverString: "Samba %v",
            workgroup: "WORKGROUP",
            advancedOptions: {},
          } as SambaGlobalConfig)
        );
      });
      test("parsed values", () => {
        const unparsed = {
          "log level": "3",
          "server string": "Hello World",
          workgroup: "goofy goobers",
          "vfs objects": "acl xattr ceph",
          "os level": "25",
        };
        const parsed = globalParser.apply(unparsed);
        expect(parsed).toEqual(
          ok({
            logLevel: 3,
            serverString: "Hello World",
            workgroup: "goofy goobers",
            advancedOptions: {
              "vfs objects": "acl xattr ceph",
              "os level": "25",
            },
          } as SambaGlobalConfig)
        );
        expect(parsed.andThen(globalParser.unapply)).toEqual(ok(unparsed));
      });
    });
    suite("SmbShareParser", () => {
      const parser = SmbShareParser("share name");
      test("default values", () => {
        expect(parser.apply({})).toEqual(
          ok({
            name: "share name",
            description: "",
            path: "",
            readOnly: true,
            guestOk: false,
            browseable: true,
            advancedOptions: {},
          } as SambaShareConfig)
        );
      });
      test("parsed values", () => {
        const unparsed: KeyValueData = {
          comment: "Description",
          path: "/tmp/testshare",
          "read only": "no",
          "guest ok": "yes",
          browseable: "no",
          "vfs objects": "acl xattr ceph",
          "os level": "25",
        };
        const parsed = parser.apply(unparsed);
        expect(parsed).toEqual(
          ok({
            name: "share name",
            description: "Description",
            path: "/tmp/testshare",
            readOnly: false,
            guestOk: true,
            browseable: false,
            advancedOptions: {
              "vfs objects": "acl xattr ceph",
              "os level": "25",
            },
          } as SambaShareConfig)
        );
        expect(parsed.andThen(parser.unapply)).toEqual(ok(unparsed));
      });
    });
    test("SmbConfParser", () => {
      const parser = SmbConfParser();
      const input = [
        {
          unparsed: `[global]
log level = 4
workgroup = WG
server string = Test server config
some adv option = lksdjflkjgdfdfjlkfdflkj
`,
          expected: {
            global: {
              logLevel: 4,
              serverString: "Test server config",
              workgroup: "WG",
              advancedOptions: {
                "some adv option": "lksdjflkjgdfdfjlkfdflkj",
              },
            },
            shares: [],
          } as SambaConfig,
        },
        {
          unparsed: `[global]
    log level = 4
    workgroup = WG
    server string = Test server config
    some adv option = lksdjflkjgdfdfjlkfdflkj

[share1]
    comment = hello, world!
    path = /lksdf/sdfkjrt/dflk
    guest ok = 1
    read only = false
    browsable = no
    vfs objects = ceph xattr
    some adv opt = some value
    
[share2]
comment = hello, world!
path = /lksdf/sdfkjrt/dflk
guest ok = 1
writable = false
browsable = no
vfs objects = lkjsdlf jfk kejsdf kje
some adv opt = some other value`,
          expected: {
            global: {
              logLevel: 4,
              serverString: "Test server config",
              workgroup: "WG",
              advancedOptions: {
                "some adv option": "lksdjflkjgdfdfjlkfdflkj",
              },
            },
            shares: [
              {
                name: "share1",
                description: "hello, world!",
                path: "/lksdf/sdfkjrt/dflk",
                guestOk: true,
                readOnly: false,
                browseable: false,
                advancedOptions: {
                  "vfs objects": "ceph xattr",
                  "some adv opt": "some value",
                },
              } as SambaShareConfig,
              {
                name: "share2",
                description: "hello, world!",
                path: "/lksdf/sdfkjrt/dflk",
                guestOk: true,
                readOnly: true,
                browseable: false,
                advancedOptions: {
                  "vfs objects": "lkjsdlf jfk kejsdf kje",
                  "some adv opt": "some other value",
                },
              } as SambaShareConfig,
            ],
          } as SambaConfig,
        },
      ];
      for (const { unparsed, expected } of input) {
        expect(parser.apply(unparsed)).toEqual(ok(expected));
      }
    });
  });
});
