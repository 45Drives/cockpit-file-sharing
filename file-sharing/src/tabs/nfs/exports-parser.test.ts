import { suite, test, expect } from "vitest";
import { ok, err } from "neverthrow";
import {
  NFSClientOptionsParser,
  NFSClientsParser,
  NFSExportParser,
  NFSExportsParser,
} from "./exports-parser";
import { defaultNFSClientOptions } from "@/tabs/nfs/data-types";

suite("NFS Exports Parsing", () => {
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
