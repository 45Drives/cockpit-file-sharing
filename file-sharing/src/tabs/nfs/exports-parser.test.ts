import { suite, test, expect } from "vitest";
import { ok, err } from "neverthrow";
import {
  NFSClientOptionsParser,
  NFSClientsParser,
  NFSExportParser,
  NFSExportsParser,
} from "./exports-parser";
import {
  NFSBooleanOption,
  NFSOptionWithArgument,
  NFSOptionWithOptionalArgument,
  defaultNFSClientOptions,
} from "@/tabs/nfs/data-types";

function unwrapValues<TObj extends Record<string, { value: any }>>(
  obj: TObj
): {
  [Prop in keyof TObj]: TObj[Prop]["value"];
} {
  return Object.fromEntries(Object.entries(obj).map(([key, { value }]) => [key, value])) as {
    [Prop in keyof TObj]: TObj[Prop]["value"];
  };
}

suite("NFS Exports Parsing", () => {
  suite("NFSClientOption", () => {
    test("NFSBooleanOption", () => {
      const DefaultsNo = NFSBooleanOption("yes", "no", "no");
      expect(new DefaultsNo().value).toEqual(false);
      expect(new DefaultsNo(false).value).toEqual(false);
      expect(new DefaultsNo(true).value).toEqual(true);
      expect(new DefaultsNo().configValue().orUndefined()).toBeUndefined();
      expect(new DefaultsNo(false).configValue().orUndefined()).toBeUndefined();
      expect(new DefaultsNo(true).configValue().orUndefined()).toEqual("yes");
      expect(
        DefaultsNo.fromString("no")
          .map((o) => o.value)
          .orUndefined()
      ).toEqual(false);
      expect(
        DefaultsNo.fromString("yes")
          .map((o) => o.value)
          .orUndefined()
      ).toEqual(true);
      expect(
        DefaultsNo.fromString("abc123")
          .map((o) => o.value)
          .orUndefined()
      ).toBeUndefined();
      const DefaultsYes = NFSBooleanOption("yes", "no", "yes");
      expect(new DefaultsYes().value).toEqual(true);
      expect(new DefaultsYes(false).value).toEqual(false);
      expect(new DefaultsYes(true).value).toEqual(true);
      expect(new DefaultsYes().configValue().orUndefined()).toBeUndefined();
      expect(new DefaultsYes(true).configValue().orUndefined()).toBeUndefined();
      expect(new DefaultsYes(false).configValue().orUndefined()).toEqual("no");
      expect(
        DefaultsYes.fromString("no")
          .map((o) => o.value)
          .orUndefined()
      ).toEqual(false);
      expect(
        DefaultsYes.fromString("yes")
          .map((o) => o.value)
          .orUndefined()
      ).toEqual(true);
      expect(
        DefaultsYes.fromString("abc123")
          .map((o) => o.value)
          .orUndefined()
      ).toBeUndefined();
      const DefaultsYesRequired = NFSBooleanOption("yes", "no", "yes", true);
      expect(new DefaultsYesRequired().value).toEqual(true);
      expect(new DefaultsYesRequired(false).value).toEqual(false);
      expect(new DefaultsYesRequired(true).value).toEqual(true);
      expect(new DefaultsYesRequired().configValue().orUndefined()).toEqual("yes");
      expect(new DefaultsYesRequired(true).configValue().orUndefined()).toEqual("yes");
      expect(new DefaultsYesRequired(false).configValue().orUndefined()).toEqual("no");
      expect(
        DefaultsYesRequired.fromString("no")
          .map((o) => o.value)
          .orUndefined()
      ).toEqual(false);
      expect(
        DefaultsYesRequired.fromString("yes")
          .map((o) => o.value)
          .orUndefined()
      ).toEqual(true);
      expect(
        DefaultsYesRequired.fromString("abc123")
          .map((o) => o.value)
          .orUndefined()
      ).toBeUndefined();
    });
    test("NFSOptionWithArgument", () => {
      const FSID = NFSOptionWithArgument("fsid");
      expect(new FSID().value).toBeUndefined();
      expect(new FSID("root").value).toEqual("root");
      expect(new FSID().configValue().orUndefined()).toBeUndefined();
      expect(new FSID("root").configValue().orUndefined()).toEqual("fsid=root");
      expect(new FSID("").configValue().orUndefined()).toBeUndefined();
      expect(FSID.fromString("").isNone()).toBe(true);
      expect(FSID.fromString("lkjsdf").isNone()).toBe(true);
      expect(FSID.fromString("lkjsdf=").isNone()).toBe(true);
      expect(FSID.fromString("lkjsdf=kljhdfg").isNone()).toBe(true);
      expect(FSID.fromString("fsid").isNone()).toBe(true);
      expect(FSID.fromString("fsid=").isNone()).toBe(true);
      expect(FSID.fromString("fsid=root").some().value).toEqual("root");
    });
    test("NFSOptionWithOptionalArgument", () => {
      const Mountpoint = NFSOptionWithOptionalArgument("mountpoint");
      expect(new Mountpoint().value).toBeUndefined();
      expect(new Mountpoint("/tmp").value).toEqual("/tmp");
      expect(new Mountpoint().configValue().orUndefined()).toBeUndefined();
      expect(new Mountpoint("/tmp").configValue().orUndefined()).toEqual("mountpoint=/tmp");
      expect(new Mountpoint("").configValue().orUndefined()).toEqual("mountpoint");
      expect(Mountpoint.fromString("").isNone()).toBe(true);
      expect(Mountpoint.fromString("lkjsdf").isNone()).toBe(true);
      expect(Mountpoint.fromString("lkjsdf=").isNone()).toBe(true);
      expect(Mountpoint.fromString("lkjsdf=kljhdfg").isNone()).toBe(true);
      expect(Mountpoint.fromString("mountpoint").some().value).toBe("");
      expect(Mountpoint.fromString("mountpoint=").isNone()).toBe(true);
      expect(Mountpoint.fromString("mountpoint=/tmp").some().value).toEqual("/tmp");
    });
  });
  // suite("NFSClientOptionsParser", () => {
  //   const parser = new NFSClientOptionsParser();
  //   test('default values (parse "")', () => {
  //     const defaultParsed = parser.apply("");
  //     expect(defaultParsed.isOk()).toBe(true);
  //     defaultParsed.map(unwrapValues).map((defaultParsed) => {
  //       expect(defaultParsed).toEqual({
  //         secure: true,
  //         rw: false,
  //         async: false,
  //         no_wdelay: false,
  //         nohide: false,
  //         crossmnt: false,
  //         no_subtree_check: true,
  //         insecure_locks: false,
  //         no_acl: false,
  //         mountpoint: undefined,
  //         fsid: undefined,
  //         refer: undefined,
  //         replicas: undefined,
  //         root_squash: true,
  //         all_squash: false,
  //         anonuid: undefined,
  //         anongid: undefined,
  //       });
  //     });
  //     const unparsed = defaultParsed.andThen((options) => parser.unapply(options));
  //     expect(unparsed.isOk()).toBe(true);
  //     unparsed.map((unparsed) => {
  //       expect(unparsed).toEqual("sync,no_subtree_check");
  //     });
  //   });
  // });
  // test("NFSClientsParser", () => {
  //   const parser = new NFSClientsParser();
  //   const optionsParser = new NFSClientOptionsParser();
  //   const input = `master(rw) \ttrusty(rw,no_root_squash)  proj*.local.domain(rw) *.local.domain(ro) @trusted(rw) pc001(rw,all_squash,anonuid=150,anongid=100) *(ro,insecure,all_squash) server @trusted @external(ro) 2001:db8:9:e54::/64(rw) 192.0.2.0/24(rw) buildhost[0-9].local.domain(rw)`;
  //   const parsed = parser.apply(input);
  //   expect(parsed.isOk()).toBe(true);
  //   parsed.map((parsed): void => {
  //     expect(
  //       parsed.map(({ host, settings }) => ({ host, settings: unwrapValues(settings) }))
  //     ).toEqual(
  //       [
  //         { host: "master", settings: "rw" },
  //         { host: "trusty", settings: "rw,no_root_squash" },
  //         { host: "proj*.local.domain", settings: "rw" },
  //         { host: "*.local.domain", settings: "ro" },
  //         { host: "@trusted", settings: "rw" },
  //         { host: "pc001", settings: "rw,all_squash,anonuid=150,anongid=100" },
  //         { host: "*", settings: "ro,insecure,all_squash" },
  //         { host: "server", settings: "" },
  //         { host: "@trusted", settings: "" },
  //         { host: "@external", settings: "ro" },
  //         { host: "2001:db8:9:e54::/64", settings: "rw" },
  //         { host: "192.0.2.0/24", settings: "rw" },
  //         { host: "buildhost[0-9].local.domain", settings: "rw" },
  //       ].map(({ host, settings }) => ({
  //         host,
  //         settings: unwrapValues(optionsParser.apply(settings).unwrapOr({})),
  //       }))
  //     );
  //   });
  //   const unparsed = parsed.andThen((clients) => parser.unapply(clients));
  //   expect(unparsed.isOk()).toBe(true);
  //   unparsed.map((unparsed) => {
  //     expect(unparsed).toEqual(
  //       "master(rw,sync,no_subtree_check) trusty(rw,sync,no_subtree_check,no_root_squash) proj*.local.domain(rw,sync,no_subtree_check) *.local.domain(sync,no_subtree_check) @trusted(rw,sync,no_subtree_check) pc001(rw,sync,no_subtree_check,all_squash,anonuid=150,anongid=100) *(insecure,sync,no_subtree_check,all_squash) server(sync,no_subtree_check) @trusted(sync,no_subtree_check) @external(sync,no_subtree_check) 2001:db8:9:e54::/64(rw,sync,no_subtree_check) 192.0.2.0/24(rw,sync,no_subtree_check) buildhost[0-9].local.domain(rw,sync,no_subtree_check)"
  //     );
  //   });
  // });
  test("NFSExportParser", () => {
    const parser = new NFSExportParser();
    const parse = (text: string) =>
      parser
        .apply(text)
        .map(({ path, defaultClientSettings, clients, comment }) => ({
          path,
          defaultClientSettings, //: unwrapValues(defaultClientSettings),
          clients: clients.map(({ host, settings }) => ({
            host,
            settings, //: unwrapValues(settings),
          })),
          comment,
        }))
        .unwrapOr(undefined);
    expect(parse("/               master(rw) trusty(rw,no_root_squash)")).toEqual({
      path: "/",
      defaultClientSettings: "", // unwrapValues(defaultNFSClientOptions()),
      clients: [
        {
          host: "master",
          settings: "rw",
          // { ...unwrapValues(defaultNFSClientOptions()), rw: true }
        },
        {
          host: "trusty",
          settings: "rw,no_root_squash",
          // { ...unwrapValues(defaultNFSClientOptions()), rw: true, root_squash: false },
        },
      ],
      comment: "",
    });
    expect(parse("/projects       proj*.local.domain(rw) # test comment")).toEqual({
      path: "/projects",
      defaultClientSettings: "", // unwrapValues(defaultNFSClientOptions()),
      clients: [
        {
          host: "proj*.local.domain",
          settings: "rw",
          // { ...unwrapValues(defaultNFSClientOptions()), rw: true },
        },
      ],
      comment: "test comment",
    });
    expect(parse("/home/joe       pc001(rw,all_squash,anonuid=150,anongid=100)")).toEqual({
      path: "/home/joe",
      defaultClientSettings: "", // unwrapValues(defaultNFSClientOptions()),
      clients: [
        {
          host: "pc001",
          settings: "rw,all_squash,anonuid=150,anongid=100",
          // {
          //   ...unwrapValues(defaultNFSClientOptions()),
          //   rw: true,
          //   all_squash: true,
          //   anonuid: "150",
          //   anongid: "100",
          // },
        },
      ],
      comment: "",
    });
    expect(parse("/srv/www        -sync,rw server @trusted @external(ro)")).toEqual({
      path: "/srv/www",
      defaultClientSettings: "sync,rw",
      // {
      //   ...unwrapValues(defaultNFSClientOptions()),
      //   async: false,
      //   rw: true,
      // },
      clients: [
        {
          host: "server",
          settings: "",
          // {
          //   ...unwrapValues(defaultNFSClientOptions()),
          // },
        },
        {
          host: "@trusted",
          settings: "",
          // {
          //   ...unwrapValues(defaultNFSClientOptions()),
          // },
        },
        {
          host: "@external",
          settings: "ro",
          // {
          // ...unwrapValues(defaultNFSClientOptions()),
          // rw: false,
          // },
        },
      ],
      comment: "",
    });
  });
  test("NFSExportsParser", () => {
    const parser = new NFSExportsParser();
    const input = `# sample /etc/exports file
/               master(rw) trusty(rw,no_root_squash)
/projects       proj*.local.domain(rw)
/usr            *.local.domain(ro) @trusted(rw)
/home/joe       pc001(rw,all_squash,anonuid=150,anongid=100)
/pub            *(ro,insecure,all_squash) # comment test 1
/srv/www        -sync,rw server @trusted @external(ro)
/foo  \t         2001:db8:9:e54::/64(rw) 192.0.2.0/24(rw)
/build          buildhost[0-9].local.domain(rw)
"/home/John Doe/share"  jdoe.local(rw) # lkjsdf
`;
    const parsed = parser.apply(input);
    parsed.mapErr((e) => {
      throw e;
    });
    expect(parsed.isOk()).toBe(true);
    parsed.map((parsed) => {
      expect(parsed).toEqual([
        // /               master(rw) trusty(rw,no_root_squash)
        {
          path: "/",
          defaultClientSettings: "",
          comment: "",
          clients: [
            {
              host: "master",
              settings: "rw",
            },
            {
              host: "trusty",
              settings: "rw,no_root_squash",
            },
          ],
        },
        // /projects       proj*.local.domain(rw)
        {
          path: "/projects",
          defaultClientSettings: "",
          comment: "",
          clients: [
            {
              host: "proj*.local.domain",
              settings: "rw",
            },
          ],
        },
        // /usr            *.local.domain(ro) @trusted(rw)
        {
          path: "/usr",
          defaultClientSettings: "",
          comment: "",
          clients: [
            {
              host: "*.local.domain",
              settings: "ro",
            },
            {
              host: "@trusted",
              settings: "rw",
            },
          ],
        },
        // /home/joe       pc001(rw,all_squash,anonuid=150,anongid=100)
        {
          path: "/home/joe",
          defaultClientSettings: "",
          comment: "",
          clients: [
            {
              host: "pc001",
              settings: "rw,all_squash,anonuid=150,anongid=100",
            },
          ],
        },
        // /pub            *(ro,insecure,all_squash) # comment test 1
        {
          path: "/pub",
          defaultClientSettings: "",
          comment: "comment test 1",
          clients: [
            {
              host: "*",
              settings: "ro,insecure,all_squash",
            },
          ],
        },
        // /srv/www        -sync,rw server @trusted @external(ro)
        {
          path: "/srv/www",
          defaultClientSettings: "sync,rw",
          comment: "",
          clients: [
            {
              host: "server",
              settings: "",
            },
            {
              host: "@trusted",
              settings: "",
            },
            {
              host: "@external",
              settings: "ro",
            },
          ],
        },
        // /foo            2001:db8:9:e54::/64(rw) 192.0.2.0/24(rw)
        {
          path: "/foo",
          defaultClientSettings: "",
          comment: "",
          clients: [
            {
              host: "2001:db8:9:e54::/64",
              settings: "rw",
            },
            {
              host: "192.0.2.0/24",
              settings: "rw",
            },
          ],
        },
        // /build          buildhost[0-9].local.domain(rw)
        {
          path: "/build",
          defaultClientSettings: "",
          comment: "",
          clients: [
            {
              host: "buildhost[0-9].local.domain",
              settings: "rw",
            },
          ],
        },
        // "/home/John Doe/share"  jdoe.local(rw) # lkjsdf
        {
          path: "/home/John Doe/share",
          defaultClientSettings: "",
          comment: "lkjsdf",
          clients: [
            {
              host: "jdoe.local",
              settings: "rw",
            },
          ],
        },
      ]);
    });
    const unparsed = parsed.andThen((parsed) => parser.unapply(parsed));
    expect(unparsed.isOk()).toBe(true);
    unparsed.map((unparsed) => {
      expect(unparsed).toEqual(`/ master(rw) trusty(rw,no_root_squash)
/projects proj*.local.domain(rw)
/usr *.local.domain(ro) @trusted(rw)
/home/joe pc001(rw,all_squash,anonuid=150,anongid=100)
/pub *(ro,insecure,all_squash) # comment test 1
/srv/www -sync,rw server @trusted @external(ro)
/foo 2001:db8:9:e54::/64(rw) 192.0.2.0/24(rw)
/build buildhost[0-9].local.domain(rw)
"/home/John Doe/share" jdoe.local(rw) # lkjsdf`);
    });
  });
});
