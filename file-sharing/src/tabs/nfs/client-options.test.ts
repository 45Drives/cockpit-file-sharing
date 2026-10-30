import { suite, test, expect } from "vitest";
import { validateNFSClientOptions, isKnownNFSClientOption } from "./client-options";

suite("NFS Client Options Validation", () => {
  test("empty options are valid", () => {
    expect(validateNFSClientOptions("")).toEqual({ type: "success" });
  });

  test("known boolean options are valid", () => {
    expect(validateNFSClientOptions("rw,sync,no_subtree_check").type).toBe("success");
    expect(validateNFSClientOptions("ro,async,wdelay,hide,secure,root_squash,no_all_squash").type).toBe(
      "success"
    );
  });

  test("known value options are valid, including fsid defaults", () => {
    expect(validateNFSClientOptions("fsid=0").type).toBe("success");
    expect(validateNFSClientOptions("fsid=7c8a3f9e-1234").type).toBe("success");
    expect(validateNFSClientOptions("anonuid=150,anongid=100").type).toBe("success");
    expect(validateNFSClientOptions("refer=/other").type).toBe("success");
    expect(validateNFSClientOptions("mp=/mnt").type).toBe("success");
  });

  test("sec options are valid (regression: Kerberos-secured NFSv4)", () => {
    expect(validateNFSClientOptions("sec=krb5p").type).toBe("success");
    expect(validateNFSClientOptions("sec=sys:krb5p").type).toBe("success");
    expect(validateNFSClientOptions("sec=sys:krb5:krb5i:krb5p").type).toBe("success");
    expect(
      validateNFSClientOptions(
        "rw,async,no_subtree_check,sec=krb5p,secure,root_squash,no_all_squash"
      ).type
    ).toBe("success");
    expect(isKnownNFSClientOption("sec=krb5p")).toBe(true);
    expect(isKnownNFSClientOption("sec=sys:krb5p")).toBe(true);
  });

  test("other known exports(5) options are valid", () => {
    expect(validateNFSClientOptions("protocols=2,3,4,9").type).toBe("success");
    expect(validateNFSClientOptions("mountgids=100,200").type).toBe("success");
    // pinclient takes no argument
    expect(validateNFSClientOptions("pinclient").type).toBe("success");
    expect(validateNFSClientOptions("pinclient=1").type).toBe("warning");
    expect(validateNFSClientOptions("protocols").type).toBe("error");
  });

  test("unknown bare keywords are errors (typos)", () => {
    expect(validateNFSClientOptions("rw,roo").type).toBe("error");
    expect(validateNFSClientOptions("sec").type).toBe("error");
    expect(validateNFSClientOptions("rwsync").message).toContain('"rwsync"');
  });

  test("unknown value options are warnings, not errors (advanced options)", () => {
    const result = validateNFSClientOptions("rw,futuropt=1");
    expect(result.type).toBe("warning");
    expect(result.message).toContain('"futuropt=1"');
    // A warning does not list known options.
    expect(validateNFSClientOptions("rw,sec=krb5p").type).toBe("success");
  });

  test("warnings mixed with known options only warn about the unknown ones", () => {
    const result = validateNFSClientOptions("rw,sec=krb5p,weird=opt");
    expect(result.type).toBe("warning");
    expect(result.message).toContain('"weird=opt"');
    expect(result.message).not.toContain("rw");
    expect(result.message).not.toContain("sec=krb5p");
  });

  test("whitespace is rejected", () => {
    expect(validateNFSClientOptions("rw, sync").type).toBe("error");
    expect(validateNFSClientOptions("rw sync").message).toContain("Whitespace");
  });

  test("empty values are not silently treated as keys", () => {
    expect(validateNFSClientOptions("fsid=").type).toBe("success");
    expect(validateNFSClientOptions("=krb5p").type).toBe("error");
  });
});
