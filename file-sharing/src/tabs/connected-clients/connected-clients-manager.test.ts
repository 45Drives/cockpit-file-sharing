import { suite, test, expect } from "vitest";
import { aggregateByLogicalClient } from "./connected-clients-manager";
import type { ConnectedClient } from "./data-types";

const makeRow = (overrides: Partial<ConnectedClient>): ConnectedClient => ({
  id: "stub",
  protocol: "samba",
  user: "alice",
  ip: "10.0.0.1",
  hostname: null,
  protocolVersion: "SMB3_11",
  share: null,
  connectedSince: null,
  openFiles: 0,
  encrypted: true,
  ...overrides,
});

suite("connected-clients-manager aggregateByLogicalClient", () => {
  test("empty input → empty output", () => {
    expect(aggregateByLogicalClient([])).toEqual([]);
  });

  test("single row passes through with id rewritten to logical-client key", () => {
    const input = [makeRow({ share: "Public" })];
    const out = aggregateByLogicalClient(input);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("samba:alice:10.0.0.1");
    expect(out[0]!.share).toBe("Public");
  });

  test("multi-tcon merge: same (protocol, user, ip) collapses into one row", () => {
    const input = [
      makeRow({ share: "IPC$", openFiles: 0, encrypted: true }),
      makeRow({ share: "Resilio", openFiles: 2, encrypted: true }),
      makeRow({ share: "Downloads", openFiles: 5, encrypted: true }),
    ];
    const out = aggregateByLogicalClient(input);
    expect(out).toHaveLength(1);
    expect(out[0]!.share).toBe("IPC$, Resilio, Downloads");
    expect(out[0]!.openFiles).toBe(7);
    expect(out[0]!.encrypted).toBe(true);
  });

  test("encryption is conservative AND: any unencrypted tcon → row encrypted false", () => {
    const input = [
      makeRow({ share: "A", encrypted: true }),
      makeRow({ share: "B", encrypted: false }),
    ];
    const out = aggregateByLogicalClient(input);
    expect(out[0]!.encrypted).toBe(false);
  });

  test("connectedSince is the earliest non-null timestamp across tcons", () => {
    const earlier = new Date("2026-01-01T00:00:00Z");
    const middle = new Date("2026-01-01T00:05:00Z");
    const later = new Date("2026-01-01T00:10:00Z");
    const input = [
      makeRow({ share: "A", connectedSince: middle }),
      makeRow({ share: "B", connectedSince: earlier }),
      makeRow({ share: "C", connectedSince: later }),
    ];
    const out = aggregateByLogicalClient(input);
    expect(out[0]!.connectedSince?.toISOString()).toBe(earlier.toISOString());
  });

  test("null connectedSince values are ignored in the earliest computation", () => {
    const t = new Date("2026-01-01T00:00:00Z");
    const input = [
      makeRow({ share: "A", connectedSince: null }),
      makeRow({ share: "B", connectedSince: t }),
    ];
    expect(aggregateByLogicalClient(input)[0]!.connectedSince?.toISOString()).toBe(t.toISOString());
  });

  test("different users from same IP do NOT merge", () => {
    const input = [
      makeRow({ user: "alice", share: "A" }),
      makeRow({ user: "bob", share: "B" }),
    ];
    const out = aggregateByLogicalClient(input);
    expect(out).toHaveLength(2);
  });

  test("different protocols at same (user, ip) do NOT merge", () => {
    const input = [
      makeRow({ protocol: "samba", share: "A" }),
      makeRow({ protocol: "nfs", user: null, share: null }),
    ];
    const out = aggregateByLogicalClient(input);
    expect(out).toHaveLength(2);
  });

  test("duplicate shares within a single client are deduped in the joined string", () => {
    const input = [
      makeRow({ share: "Public" }),
      makeRow({ share: "Public" }),
    ];
    const out = aggregateByLogicalClient(input);
    expect(out[0]!.share).toBe("Public");
  });

  test("rows with null share are filtered out of the joined share string", () => {
    const input = [
      makeRow({ share: null }),
      makeRow({ share: "Real" }),
    ];
    const out = aggregateByLogicalClient(input);
    expect(out[0]!.share).toBe("Real");
  });

  test("all-null shares yield share = null on the merged row", () => {
    const input = [makeRow({ share: null }), makeRow({ share: null })];
    expect(aggregateByLogicalClient(input)[0]!.share).toBeNull();
  });
});
