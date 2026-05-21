import { suite, test, expect } from "vitest";
import { parseDump } from "./nfs-clients";

const sample = (id: string, body: string) => `---CLIENT:${id}---\n${body}`;

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
});
