import { suite, test, expect } from "vitest";
import { buildClients } from "./samba-clients";

suite("samba-clients buildClients", () => {
  test("empty smbstatus output returns no rows", () => {
    expect(buildClients({})).toEqual([]);
    expect(buildClients({ sessions: {}, tcons: {}, open_files: {} })).toEqual([]);
  });

  test("single session with single tcon yields one row", () => {
    const rows = buildClients({
      sessions: {
        "111": {
          session_id: "111",
          username: "alice",
          remote_machine: "10.0.0.1",
          hostname: "ipv4:10.0.0.1:1234",
          session_dialect: "SMB3_11",
          auth_time: "2026-01-01T00:00:00+00:00",
          encryption: { cipher: "AES-128-GCM", degree: "full" },
        },
      },
      tcons: {
        "222": {
          tcon_id: "222",
          session_id: "111",
          service: "Public",
          machine: "10.0.0.1",
          connected_at: "2026-01-01T00:00:05+00:00",
          encryption: { cipher: "AES-128-GCM", degree: "full" },
        },
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      protocol: "samba",
      user: "alice",
      ip: "10.0.0.1",
      share: "Public",
      protocolVersion: "SMB3_11",
      encrypted: true,
      openFiles: 0,
    });
  });

  test("multi-tcon session yields one row per tcon", () => {
    const rows = buildClients({
      sessions: {
        "111": {
          session_id: "111",
          username: "alice",
          remote_machine: "10.0.0.1",
          session_dialect: "SMB3_11",
        },
      },
      tcons: {
        "200": { tcon_id: "200", session_id: "111", service: "IPC$" },
        "201": { tcon_id: "201", session_id: "111", service: "Resilio" },
        "202": { tcon_id: "202", session_id: "111", service: "Downloads" },
      },
    });
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.share).sort()).toEqual(["Downloads", "IPC$", "Resilio"]);
    expect(new Set(rows.map((r) => r.user))).toEqual(new Set(["alice"]));
  });

  test("session without a tcon still produces a row", () => {
    const rows = buildClients({
      sessions: {
        "111": {
          session_id: "111",
          username: "alice",
          remote_machine: "10.0.0.1",
          session_dialect: "SMB3_11",
          auth_time: "2026-01-01T00:00:00+00:00",
        },
      },
      tcons: {},
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      protocol: "samba",
      user: "alice",
      ip: "10.0.0.1",
      share: null,
    });
  });

  test("open_files entries count toward the matching tcon's row", () => {
    const rows = buildClients({
      sessions: {
        "111": { session_id: "111", username: "alice", remote_machine: "10.0.0.1" },
      },
      tcons: {
        "222": { tcon_id: "222", session_id: "111", service: "Public" },
        "333": { tcon_id: "333", session_id: "111", service: "Other" },
      },
      open_files: {
        "0/1001": { opens: { "111/222": {}, "111/333": {} } },
        "0/1002": { opens: { "111/222": {} } },
      },
    });
    const byShare = Object.fromEntries(rows.map((r) => [r.share, r.openFiles]));
    expect(byShare.Public).toBe(2);
    expect(byShare.Other).toBe(1);
  });

  test("encryption: false when degree is none, true when cipher is set", () => {
    const rows = buildClients({
      sessions: {
        "111": {
          session_id: "111",
          username: "alice",
          remote_machine: "10.0.0.1",
          encryption: { cipher: "-", degree: "none" },
        },
      },
      tcons: {
        "200": {
          tcon_id: "200",
          session_id: "111",
          service: "Plain",
          encryption: { cipher: "-", degree: "none" },
        },
        "201": {
          tcon_id: "201",
          session_id: "111",
          service: "Encrypted",
          encryption: { cipher: "AES-128-GCM", degree: "full" },
        },
      },
    });
    const byShare = Object.fromEntries(rows.map((r) => [r.share, r.encrypted]));
    expect(byShare.Plain).toBe(false);
    expect(byShare.Encrypted).toBe(true);
  });

  test("connectedSince prefers tcon.connected_at over session.auth_time", () => {
    const rows = buildClients({
      sessions: {
        "111": {
          session_id: "111",
          username: "alice",
          remote_machine: "10.0.0.1",
          auth_time: "2026-01-01T00:00:00+00:00",
        },
      },
      tcons: {
        "200": {
          tcon_id: "200",
          session_id: "111",
          service: "Public",
          connected_at: "2026-01-01T00:05:00+00:00",
        },
      },
    });
    expect(rows[0]!.connectedSince?.toISOString()).toBe("2026-01-01T00:05:00.000Z");
  });

  test("row id is `samba:${sessionId}/${tconId}`", () => {
    const rows = buildClients({
      sessions: {
        "111": { session_id: "111", username: "alice", remote_machine: "10.0.0.1" },
      },
      tcons: {
        "200": { tcon_id: "200", session_id: "111", service: "Public" },
      },
    });
    expect(rows[0]!.id).toBe("samba:111/200");
  });
});
