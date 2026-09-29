import { Command, type Server } from "@45drives/houston-common-lib";

export type NFSPortStatus = {
  host: string;
  port: number;
  listening: boolean | null;
  firewallZones: { name: string; allowed: boolean | null; manageable: boolean }[];
  firewallActive: boolean | null;
};

const getNfsPort = async (node: Server) => {
  const advertisedPort = await node.execute(new Command(["rpcinfo", "-p"])).match(
    (proc) => Number(proc.getStdout().match(/^\s*100003\s+4\s+tcp\s+(\d+)/m)?.[1]) || null,
    () => null
  );
  return advertisedPort ?? 2049;
};

const getFirewallZoneStatus = (node: Server, zone: string, port: number) =>
  node.execute(new Command(["firewall-cmd", `--zone=${zone}`, "--list-all"])).match(
    (proc) => {
      const output = proc.getStdout();
      const target = output.match(/^[ \t]*target:[ \t]*([^\r\n]*)/m)?.[1];
      const services = output.match(/^[ \t]*services:[ \t]*([^\r\n]*)/m)?.[1];
      const ports = output.match(/^[ \t]*ports:[ \t]*([^\r\n]*)/m)?.[1];
      const otherAllowance =
        target?.trim() === "ACCEPT" || (port === 2049 && services?.split(/\s+/).includes("nfs"));
      return {
        name: zone,
        allowed:
          target === undefined || services === undefined || ports === undefined
            ? null
            : otherAllowance || ports.split(/\s+/).includes(`${port}/tcp`),
        manageable:
          target !== undefined && services !== undefined && ports !== undefined && !otherAllowance,
      };
    },
    () => ({ name: zone, allowed: null, manageable: false })
  );

const getFirewallZones = async (node: Server, port: number) => {
  const zones = await node.execute(new Command(["firewall-cmd", "--get-active-zones"])).match(
    (proc) =>
      proc
        .getStdout()
        .split("\n")
        .filter((line) => line && !/^\s/.test(line))
        .map((line) => line.trim()),
    () => null
  );
  return Promise.all((zones ?? []).map((zone) => getFirewallZoneStatus(node, zone, port)));
};

export const getNfsPortStatus = async (node: Server): Promise<NFSPortStatus> => {
  const port = await getNfsPort(node);
  const listening = await node
    .execute(new Command(["ss", "-H", "-ltn", `( sport = :${port} )`]))
    .match(
      (proc) => proc.getStdout().trim() !== "",
      () => null
    );
  const firewallActive = await node.execute(new Command(["firewall-cmd", "--state"])).match(
    (proc) => proc.getStdout().trim() === "running",
    () => null
  );
  const firewallZones = await getFirewallZones(node, port);
  return {
    host: node.host || cockpit.gettext("Local server"),
    port,
    listening,
    firewallZones,
    firewallActive,
  };
};
