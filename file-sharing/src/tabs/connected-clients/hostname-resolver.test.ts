import { suite, test, expect } from "vitest";
import { parseNmblookup } from "./hostname-resolver";

suite("hostname-resolver parseNmblookup", () => {
  test("empty input yields null for every requested IP", () => {
    const map = parseNmblookup("", ["10.0.0.1", "10.0.0.2"]);
    expect(map.get("10.0.0.1")).toBeNull();
    expect(map.get("10.0.0.2")).toBeNull();
  });

  test("single host with <00> record resolves to its NetBIOS name", () => {
    const stdout = [
      "---IP:192.168.3.5---",
      "Looking up status of 192.168.3.5",
      "\tWINBOX          <00> -         B <ACTIVE>",
      "\tWORKGROUP       <00> - <GROUP> B <ACTIVE>",
    ].join("\n");
    const map = parseNmblookup(stdout, ["192.168.3.5"]);
    expect(map.get("192.168.3.5")).toBe("WINBOX");
  });

  test("<GROUP> records are skipped — workgroup name must not become hostname", () => {
    const stdout = [
      "---IP:10.0.0.1---",
      "\tWORKGROUP       <00> - <GROUP> B <ACTIVE>",
      "\tHOSTNAME        <00> -         B <ACTIVE>",
    ].join("\n");
    expect(parseNmblookup(stdout, ["10.0.0.1"]).get("10.0.0.1")).toBe("HOSTNAME");
  });

  test("non-responding host stays null", () => {
    const stdout = [
      "---IP:10.0.0.7---",
      "Looking up status of 10.0.0.7",
      "No reply from 10.0.0.7",
    ].join("\n");
    expect(parseNmblookup(stdout, ["10.0.0.7"]).get("10.0.0.7")).toBeNull();
  });

  test("mixed batch: some resolve, some don't", () => {
    const stdout = [
      "---IP:10.0.0.1---",
      "\tONE             <00> -         B <ACTIVE>",
      "---IP:10.0.0.2---",
      "No reply from 10.0.0.2",
      "---IP:10.0.0.3---",
      "\tTHREE           <00> -         B <ACTIVE>",
    ].join("\n");
    const map = parseNmblookup(stdout, ["10.0.0.1", "10.0.0.2", "10.0.0.3"]);
    expect(map.get("10.0.0.1")).toBe("ONE");
    expect(map.get("10.0.0.2")).toBeNull();
    expect(map.get("10.0.0.3")).toBe("THREE");
  });

  test("only the first <00> non-group record is used per host", () => {
    const stdout = [
      "---IP:10.0.0.1---",
      "\tFIRST           <00> -         B <ACTIVE>",
      "\tSECOND          <00> -         B <ACTIVE>",
    ].join("\n");
    expect(parseNmblookup(stdout, ["10.0.0.1"]).get("10.0.0.1")).toBe("FIRST");
  });
});
