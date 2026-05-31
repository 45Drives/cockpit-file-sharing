import { suite, test, expect } from "vitest";
import {
  parseDump,
  parseMountInfo,
  parseExports,
  parseStates,
  deriveShares,
} from "./nfs-clients";

const sample = (id: string, body: string) => `---CLIENT:${id}---\n${body}`;

// Realistic-ish global context fixture for the share-derivation tests below.
// Major:minor 0:74 maps to /tank/general, 0:75 to /tank/media, 0:99 to
// /not-exported (deliberately not in EXPORTS to exercise the negative path).
const ctx = (extra?: { mountinfo?: string; exports?: string }) =>
  [
    "---MOUNTINFO---",
    extra?.mountinfo ??
      [
        "26 25 0:24 / /sys rw,relatime - sysfs sysfs rw",
        "40 25 0:74 / /tank/general rw,relatime - zfs tank/general rw",
        "41 25 0:75 / /tank/media rw,relatime - zfs tank/media rw",
        "42 25 0:99 / /not-exported rw,relatime - zfs tank/scratch rw",
      ].join("\n"),
    "---EXPORTS---",
    extra?.exports ??
      [
        "# header comment",
        "/tank/general 10.0.0.2(rw,sync,no_subtree_check)",
        "/tank/media   10.0.0.2(rw,sync,no_subtree_check)",
      ].join("\n"),
  ].join("\n") + "\n";

suite("nfs-clients parseDump", () => {
  test("empty input returns no rows", () => {
    expect(parseDump("")).toEqual([]);
    expect(parseDump("   \n  \n")).toEqual([]);
  });

  test("single client with full info block", () => {
    const stdout = sample(
      "abc123",
      [
        "---INFO---",
        "address: 192.168.3.8:919",
        "status: confirmed",
        "name: Linux NFSv4.2 quim",
        "minor version: 2",
        "Implementation domain: kernel.org",
        "callback state: UP",
        "---STATES---",
        "type: O, # locks: 0, # files: 1, stateid: foo",
      ].join("\n")
    );
    const rows = parseDump(stdout);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "nfs:abc123",
      protocol: "nfs",
      user: null,
      ip: "192.168.3.8",
      hostname: "quim",
      protocolVersion: "NFSv4.2",
      share: null,
      connectedSince: null,
      openFiles: 1,
      encrypted: false,
    });
  });

  test("multiple clients are returned in order", () => {
    const stdout =
      sample(
        "a",
        ["---INFO---", "address: 10.0.0.1:919", "name: Linux NFSv4.1 host-a", "minor version: 1"].join(
          "\n"
        )
      ) +
      "\n" +
      sample(
        "b",
        ["---INFO---", "address: 10.0.0.2:919", "name: Linux NFSv4.2 host-b", "minor version: 2"].join(
          "\n"
        )
      );
    const rows = parseDump(stdout);
    expect(rows.map((r) => r.id)).toEqual(["nfs:a", "nfs:b"]);
    expect(rows.map((r) => r.protocolVersion)).toEqual(["NFSv4.1", "NFSv4.2"]);
    expect(rows.map((r) => r.hostname)).toEqual(["host-a", "host-b"]);
  });

  test("IPv6 address has the bracketed part extracted as ip", () => {
    const stdout = sample(
      "v6",
      ["---INFO---", "address: [fe80::1]:919", "name: Linux NFSv4.2 ipv6host", "minor version: 2"].join(
        "\n"
      )
    );
    const rows = parseDump(stdout);
    expect(rows[0]!.ip).toBe("fe80::1");
  });

  test("name with no trailing hostname leaves hostname null", () => {
    const stdout = sample(
      "x",
      ["---INFO---", "address: 10.0.0.1:919", "name: Linux", "minor version: 2"].join("\n")
    );
    expect(parseDump(stdout)[0]!.hostname).toBeNull();
  });

  test("missing minor version falls back to NFSv4", () => {
    const stdout = sample(
      "x",
      ["---INFO---", "address: 10.0.0.1:919", "name: Something else here"].join("\n")
    );
    expect(parseDump(stdout)[0]!.protocolVersion).toBe("NFSv4");
  });

  test("states block: count is non-empty trimmed lines", () => {
    const stdout = sample(
      "x",
      [
        "---INFO---",
        "address: 10.0.0.1:919",
        "name: Linux NFSv4.2 client",
        "minor version: 2",
        "---STATES---",
        "  line1  ",
        "",
        "line2",
        "",
        "line3",
      ].join("\n")
    );
    expect(parseDump(stdout)[0]!.openFiles).toBe(3);
  });

  test("no states block yields openFiles 0", () => {
    const stdout = sample(
      "x",
      ["---INFO---", "address: 10.0.0.1:919", "name: Linux NFSv4.2 client", "minor version: 2"].join(
        "\n"
      )
    );
    expect(parseDump(stdout)[0]!.openFiles).toBe(0);
  });

  test("quote-wrapped info values are stripped (real kernel format)", () => {
    // Recent kernels wrap address and name in double quotes. The parser
    // should strip them so the IP doesn't render as `"10.0.0.1` and the
    // hostname as `host"`.
    const stdout = sample(
      "q",
      [
        "---INFO---",
        'address: "10.0.0.1:919"',
        "status: confirmed",
        'name: "Linux NFSv4.2 quotedhost"',
        "minor version: 2",
      ].join("\n")
    );
    const row = parseDump(stdout)[0]!;
    expect(row.ip).toBe("10.0.0.1");
    expect(row.hostname).toBe("quotedhost");
  });

  test("MTIME marker is parsed into connectedSince", () => {
    const epoch = 1716196800; // 2024-05-20T08:00:00Z
    const stdout = sample(
      "m",
      [
        "---MTIME---",
        String(epoch),
        "---INFO---",
        "address: 10.0.0.1:919",
        "name: Linux NFSv4.2 mtimehost",
        "minor version: 2",
      ].join("\n")
    );
    const row = parseDump(stdout)[0]!;
    expect(row.connectedSince).toBeInstanceOf(Date);
    expect(row.connectedSince!.getTime()).toBe(epoch * 1000);
  });

  test("missing MTIME marker leaves connectedSince null", () => {
    // Older kernels / hosts where stat -c %Y produced no output; parser
    // must fall back to null rather than NaN-ing the Date.
    const stdout = sample(
      "n",
      ["---INFO---", "address: 10.0.0.1:919", "name: Linux NFSv4.2 host", "minor version: 2"].join(
        "\n"
      )
    );
    expect(parseDump(stdout)[0]!.connectedSince).toBeNull();
  });

  test("non-numeric MTIME line yields null connectedSince", () => {
    const stdout = sample(
      "b",
      [
        "---MTIME---",
        "not-an-epoch",
        "---INFO---",
        "address: 10.0.0.1:919",
        "name: Linux NFSv4.2 host",
        "minor version: 2",
      ].join("\n")
    );
    expect(parseDump(stdout)[0]!.connectedSince).toBeNull();
  });

  test("MTIME of 0 (epoch) is rejected as connectedSince", () => {
    // A real client dentry will always have a positive mtime; 0 indicates
    // stat failed or returned a placeholder. Treat as missing.
    const stdout = sample(
      "z",
      [
        "---MTIME---",
        "0",
        "---INFO---",
        "address: 10.0.0.1:919",
        "name: Linux NFSv4.2 host",
        "minor version: 2",
      ].join("\n")
    );
    expect(parseDump(stdout)[0]!.connectedSince).toBeNull();
  });

  test("CLIENT block with no parseable address produces no row", () => {
    // Regression: when /proc/fs/nfsd/clients/ exists but is empty, the bash
    // glob doesn't expand and the dump produced a stray `---CLIENT:*---`
    // with no INFO content. The parser must skip it, not emit a phantom row
    // with id "nfs:*" and empty IP.
    const stdout = sample("*", "---MTIME---\n");
    expect(parseDump(stdout)).toEqual([]);
  });

  test("CLIENT block with INFO but no address is also skipped", () => {
    // Belt-and-braces: even if a future kernel format omitted the address
    // line, we shouldn't render a row with no identity.
    const stdout = sample(
      "abc",
      ["---INFO---", "status: confirmed", "name: Linux NFSv4.2 host"].join("\n")
    );
    expect(parseDump(stdout)).toEqual([]);
  });
});

suite("nfs-clients parseMountInfo", () => {
  test("extracts major:minor → mount-path pairs", () => {
    const map = parseMountInfo(
      [
        "26 25 0:24 / /sys rw,relatime - sysfs sysfs rw",
        "40 25 0:74 / /tank/general rw,relatime - zfs tank/general rw",
      ].join("\n")
    );
    expect(map.get("0:24")).toEqual(["/sys"]);
    expect(map.get("0:74")).toEqual(["/tank/general"]);
    expect(map.size).toBe(2);
  });

  test("collects ALL mount paths for the same superblock (multi-mount filesystems)", () => {
    // A single filesystem can be visible at multiple mount points — bind
    // mounts, ZFS datasets with secondary mountpoints, LVM-bind layouts,
    // some container setups. Keeping every candidate lets deriveShares pick
    // whichever one is actually exported, regardless of mountinfo line
    // order (which a single-value Map would silently truncate to "last
    // wins" — and "last" can easily be a non-exported bind-mount path).
    const map = parseMountInfo(
      [
        "40 25 0:42 / /srv/data rw - ext4 /dev/sda1 rw",
        "41 25 0:42 / /export/data rw - ext4 /dev/sda1 rw",
      ].join("\n")
    );
    expect(map.get("0:42")).toEqual(["/srv/data", "/export/data"]);
  });

  test("ignores lines that don't have a major:minor in column 3", () => {
    // Garbage / truncated lines must not corrupt the map.
    const map = parseMountInfo(
      ["bogus line", "40 25 not-a-device / /tank/general rw - zfs tank/general rw"].join("\n")
    );
    expect(map.size).toBe(0);
  });

  test("empty input → empty map", () => {
    expect(parseMountInfo("").size).toBe(0);
  });
});

suite("nfs-clients parseExports", () => {
  test("extracts the first whitespace-delimited path on each non-comment line", () => {
    const set = parseExports(
      [
        "# comment",
        "",
        "/tank/general 10.0.0.2(rw,sync)",
        "/tank/media   10.0.0.2(rw,sync,no_subtree_check)",
      ].join("\n")
    );
    expect(set.has("/tank/general")).toBe(true);
    expect(set.has("/tank/media")).toBe(true);
    expect(set.size).toBe(2);
  });

  test("skips comment and blank lines", () => {
    const set = parseExports(["# foo", "", "  ", "# /tank/should-not-appear"].join("\n"));
    expect(set.size).toBe(0);
  });

  test("requires path to start with /", () => {
    // wildcard / netgroup paths aren't valid NFSv4 exports; filter them out
    // so they can't accidentally match a mount path in the derivation step.
    const set = parseExports(["* 10.0.0.2(rw)", "@group 10.0.0.2(rw)"].join("\n"));
    expect(set.size).toBe(0);
  });
});

suite("nfs-clients parseStates", () => {
  test("extracts filename + superblock and converts hex major:minor to decimal", () => {
    // Real kernel format: superblock is hex major:minor:inode; we only need
    // major:minor for the mountinfo join, and we want it as decimal because
    // that's how /proc/self/mountinfo writes column 3.
    const line =
      `- 0x1234: { type: open, access: rw, deny: --, superblock: "00:4a:1260", ` +
      `filename: "Wordlists/101.txt" }`;
    const entries = parseStates(line);
    expect(entries).toEqual([{ filename: "Wordlists/101.txt", superblock: "0:74" }]);
  });

  test("multiple entries on consecutive lines all parse", () => {
    const content = [
      `- 0xa: { type: deleg, access: r, superblock: "00:4a:1260", filename: "a.txt" }`,
      `- 0xb: { type: open, access: rw, deny: --, superblock: "00:4b:99", filename: "sub/b.txt" }`,
    ].join("\n");
    const entries = parseStates(content);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.superblock).toBe("0:74");
    expect(entries[1]!.superblock).toBe("0:75");
  });

  test("lines without both superblock and filename are skipped", () => {
    expect(parseStates(`- 0x1: { type: open, superblock: "00:4a:1260" }`)).toEqual([]);
    expect(parseStates(`- 0x1: { type: open, filename: "x" }`)).toEqual([]);
    expect(parseStates(`random noise`)).toEqual([]);
  });
});

suite("nfs-clients deriveShares", () => {
  const mountInfo = new Map<string, string[]>([
    ["0:74", ["/tank/general"]],
    ["0:75", ["/tank/media"]],
    ["0:99", ["/not-exported"]],
  ]);
  const exports = new Set(["/tank/general", "/tank/media"]);

  test("returns single export when one open file matches", () => {
    expect(
      deriveShares([{ filename: "Wordlists/101.txt", superblock: "0:74" }], mountInfo, exports)
    ).toBe("/tank/general");
  });

  test("comma-joins (sorted) when files span multiple exports", () => {
    expect(
      deriveShares(
        [
          { filename: "a.txt", superblock: "0:75" },
          { filename: "b.txt", superblock: "0:74" },
        ],
        mountInfo,
        exports
      )
    ).toBe("/tank/general, /tank/media");
  });

  test("dedupes when multiple files map to the same export", () => {
    expect(
      deriveShares(
        [
          { filename: "a.txt", superblock: "0:74" },
          { filename: "b.txt", superblock: "0:74" },
        ],
        mountInfo,
        exports
      )
    ).toBe("/tank/general");
  });

  test("returns null when no open files", () => {
    expect(deriveShares([], mountInfo, exports)).toBeNull();
  });

  test("returns null when superblock has no mount-info match", () => {
    expect(
      deriveShares([{ filename: "x", superblock: "9:99" }], mountInfo, exports)
    ).toBeNull();
  });

  test("returns null when mount path isn't an export", () => {
    expect(
      deriveShares([{ filename: "x", superblock: "0:99" }], mountInfo, exports)
    ).toBeNull();
  });

  test("returns null when exports set is empty (no /etc/exports content)", () => {
    expect(
      deriveShares([{ filename: "x", superblock: "0:74" }], mountInfo, new Set())
    ).toBeNull();
  });

  test("multi-mount filesystem: picks the export-matching path, ignores siblings", () => {
    // Regression: when a filesystem is visible at multiple mount points (e.g.
    // a ZFS dataset with a secondary mountpoint, or any `mount --bind`
    // layout), the parser keeps every candidate path and deriveShares picks
    // whichever is the actual export — regardless of mountinfo line order.
    // Before the fix this collapsed to a single value, last-write-wins, and
    // a non-exported bind-mount path would silently win.
    const multiMount = new Map<string, string[]>([
      ["0:42", ["/srv/data", "/export/data", "/mnt/bind/data"]],
    ]);
    const onlyExportedPath = new Set(["/export/data"]);
    expect(
      deriveShares([{ filename: "f", superblock: "0:42" }], multiMount, onlyExportedPath)
    ).toBe("/export/data");
  });
});

suite("nfs-clients parseDump — share derivation integration", () => {
  test("idle client (empty states) leaves share null", () => {
    const stdout =
      ctx() +
      sample(
        "idle",
        [
          "---MTIME---",
          "1716196800",
          "---INFO---",
          'address: "10.0.0.2:111"',
          'name: "Linux NFSv4.2 idleclient"',
          "minor version: 2",
        ].join("\n")
      );
    const row = parseDump(stdout)[0]!;
    expect(row.share).toBeNull();
    expect(row.ip).toBe("10.0.0.2");
  });

  test("active client (open file on exported mount) gets share populated", () => {
    const stdout =
      ctx() +
      sample(
        "active",
        [
          "---MTIME---",
          "1716196800",
          "---INFO---",
          'address: "10.0.0.2:222"',
          'name: "Linux NFSv4.2 activeclient"',
          "minor version: 2",
          "---STATES---",
          `- 0x1: { type: open, superblock: "00:4a:1260", filename: "foo.txt" }`,
        ].join("\n")
      );
    const row = parseDump(stdout)[0]!;
    expect(row.share).toBe("/tank/general");
  });

  test("global context applies to every CLIENT in the dump", () => {
    const stdout =
      ctx() +
      sample(
        "c1",
        [
          "---INFO---",
          'address: "10.0.0.2:1"',
          "minor version: 2",
          "---STATES---",
          `- 0x1: { type: open, superblock: "00:4a:1", filename: "x" }`,
        ].join("\n")
      ) +
      "\n" +
      sample(
        "c2",
        [
          "---INFO---",
          'address: "10.0.0.3:1"',
          "minor version: 2",
          "---STATES---",
          `- 0x1: { type: open, superblock: "00:4b:1", filename: "y" }`,
        ].join("\n")
      );
    const rows = parseDump(stdout);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.share).toBe("/tank/general");
    expect(rows[1]!.share).toBe("/tank/media");
  });

  test("missing MOUNTINFO/EXPORTS context degrades gracefully (share=null, row still appears)", () => {
    // If the bash dump emits CLIENT blocks but no global context (unlikely
    // but defensive), every NFS row gets share=null instead of crashing.
    const stdout = sample(
      "abc",
      [
        "---INFO---",
        'address: "10.0.0.2:1"',
        "minor version: 2",
        "---STATES---",
        `- 0x1: { type: open, superblock: "00:4a:1", filename: "x" }`,
      ].join("\n")
    );
    const row = parseDump(stdout)[0]!;
    expect(row.share).toBeNull();
    expect(row.ip).toBe("10.0.0.2");
  });
});
