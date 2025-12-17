import { safeTry, okAsync, ok } from 'neverthrow';
import { ResultAsync } from 'neverthrow';
import { PCSResource, PCSResourceType, PCSResourceTypeInfo } from "@/tabs/iSCSI/types/cluster/PCSResource";
import { PCSResourceGroup } from '@/tabs/iSCSI/types/cluster/PCSResourceGroup';
import { BashCommand, ProcessError, safeJsonParse, type Server } from "@45drives/houston-common-lib";

export class PCSResourceManager {

    server: Server;

    currentResources: PCSResource[] | undefined;

    constructor(server: Server) {
        this.server = server;

        this.currentResources = undefined;
    }

    createResource(name: string, creationArguments: string, type: PCSResourceType, server: Server) {
        const resourceName = name.replace(':', '_');
        const creationCommand = new BashCommand(`pcs resource create '${resourceName}' ${creationArguments}`);
        // console.log("creation command", creationCommand.toString());
        return server.execute(creationCommand).map(() => {
          const resource = new PCSResource(resourceName, type);
          this.currentResources = [...this.currentResources!, resource];
          return resource;
        });
      }

    deleteResource(resource: Pick<PCSResource, "name">) {
      // console.log(`pcs resource delete '${resource.name}'`);
        return this.server.execute(new BashCommand(`pcs resource delete '${resource.name}'`))
        .map(() => {
            this.currentResources = this.currentResources!.filter((existingResource) => existingResource.name !== resource.name);
            return undefined;
        })
    }

    disableResource(resource: Pick<PCSResource, "name">) {
        return this.server.execute(new BashCommand(`pcs resource disable '${resource.name}' `))
        .map(() => undefined);
    }

    deleteResourceGroup(resourceGroup: Pick<PCSResourceGroup, "name">) {
        return this.server.execute(new BashCommand(`pcs resource delete '${resourceGroup.name}'`))
        .map(() => {
            this.currentResources = this.currentResources!.filter((existingResource) => existingResource.resourceGroup?.name !== resourceGroup.name);
            return undefined;
        })
    }

    updateResource(resource: PCSResource, parameters: String) {
        return this.server.execute(new BashCommand(`pcs resource update '${resource.name}' ${parameters}`))
        .map(() => undefined)
    }

  
  getGroupActiveNode(resourceGroup: PCSResourceGroup): ResultAsync<string, ProcessError> {
    const self = this;
  
    const locate = (rid: string) =>
      self.server
        .execute(new BashCommand(`crm_resource --locate --resource '${rid}' 2>/dev/null || true`))
        .map(p => {
          const out = p.getStdout();
          const m = out.match(/is running on:\s+([^\s\n]+)/i);
          return m ? m[1] : undefined; // node or undefined
        })
        .mapErr(e => new ProcessError(`Failed to locate ${rid}: ${e}`));
  
    const parseGroupFromStatusText = (text: string, groupId: string): string | undefined => {
      const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const hdr = new RegExp(`^\\s*\\*\\s*Resource\\s+Group:\\s*${esc(groupId)}\\s*:`, "mi");
      const m = text.match(hdr);
      if (!m) return undefined;
      const start = m.index! + m[0].length;
      const tail = text.slice(start);
      const m2 = tail.match(/^\s*\*\s*[^\n]*?\bStarted\s+([^\s\n]+)/mi);
      return m2 ? m2[1] : undefined;
    };
  
    return new ResultAsync(
      safeTry(async function* () {
        // Use cached or freshly fetched resources
        const resources = yield* self.fetchResources().safeUnwrap();
        const groups = new Set(resources.map(r => r.resourceGroup?.name).filter(Boolean) as string[]);
  
        if (!groups.has(resourceGroup.name)) {
          throw new ProcessError(`Group "${resourceGroup.name}" not found in PCS configuration.`);
        }
  
        // Get all members of this group
        const members = resources.filter(r => r.resourceGroup?.name === resourceGroup.name);
        if (members.length === 0) {
          throw new ProcessError(`Group "${resourceGroup.name}" has no members.`);
        }
  
        // Try crm_resource --locate on each member
        const nodeCounts = new Map<string, number>();
        const perMember: Array<{ id: string; node?: string }> = [];
        for (const r of members) {
          const node = yield* locate(r.name).safeUnwrap();
          perMember.push({ id: r.name, node });
          if (node) nodeCounts.set(node, (nodeCounts.get(node) ?? 0) + 1);
        }
  
        let chosen: string | undefined;
  
        // Unanimous
        const distinct = Array.from(new Set(perMember.map(x => x.node).filter(Boolean) as string[]));
        if (distinct.length === 1) chosen = distinct[0];
  
        // Prefer VIP, then TARGET
        if (!chosen) {
          const vip = perMember.find(x => x.id.includes("_VIP_") && x.node)?.node;
          if (vip) chosen = vip;
        }
        if (!chosen) {
          const tgt = perMember.find(x => x.id.includes("_TARGET_") && x.node)?.node;
          if (tgt) chosen = tgt;
        }
  
        // Majority vote
        if (!chosen && nodeCounts.size > 0) {
          let bestNode = "";
          let bestCount = -1;
          for (const [n, c] of nodeCounts) {
            if (c > bestCount) { bestNode = n; bestCount = c; }
          }
          chosen = bestNode;
        }
  
        // Fallback: parse pcs status text
        if (!chosen) {
          const statusText = yield* self.server
            .execute(new BashCommand(`pcs status`))
            .map(p => p.getStdout())
            .mapErr(e => new ProcessError(`Failed to query pcs status: ${e}`))
            .safeUnwrap();
  
          const fromText = parseGroupFromStatusText(statusText, resourceGroup.name);
          if (fromText) chosen = fromText;
        }
  
        if (!chosen) {
          const diag =
            `members=[${members.map(m => m.name).join(", ")}];` +
            ` perMember=[${perMember.map(x => `${x.id}->${x.node ?? "NOT RUNNING"}`).join(", ")}]`;
          throw new ProcessError(`Group "${resourceGroup.name}" appears inactive (no started members). ${diag}`);
        }
  
        return okAsync(chosen);
      })
    );
  }
  
  getAnchorsForGroup(
    resourceGroup: PCSResourceGroup
  ): ResultAsync<{ targetPrimitiveId: string; portBlockOffId: string }, ProcessError> {
    const self = this;
  
    return new ResultAsync(
      safeTry(async function* () {
        const resources = yield* self.fetchResources().safeUnwrap();
  
        const members = resources.filter(r => r.resourceGroup?.name === resourceGroup.name);
        if (members.length === 0) {
          throw new ProcessError(`Group '${resourceGroup.name}' not found or has no members.`);
        }
  
        const cfg = yield* self.server
          .execute(new BashCommand(`pcs resource config --output-format json`))
          .map(p => p.getStdout())
          .andThen(safeJsonParse<PCSConfigJson>)
          .mapErr(e => new ProcessError(`Unable to get PCS configuration: ${e}`))
          .safeUnwrap();
  
        const grp = (cfg.groups ?? []).find(g => g.id === resourceGroup.name);
        if (!grp) {
          throw new ProcessError(`Group '${resourceGroup.name}' not found in PCS configuration.`);
        }
  
        const byId = new Map(members.map(r => [r.name, r]));
  
        let targetId: string | undefined;
        let portBlockOffId: string | undefined;
  
        for (const rid of grp.member_ids) {
          const r = byId.get(rid);
          if (!r) continue;
          if (!targetId && r.resourceType === PCSResourceType.TARGET) targetId = r.name;
          if (!portBlockOffId && r.resourceType === PCSResourceType.PORTBLOCK_OFF) portBlockOffId = r.name;
          if (targetId && portBlockOffId) break;
        }
  
        if (!targetId)
          throw new ProcessError(`No TARGET primitive found in group '${resourceGroup.name}'.`);
        if (!portBlockOffId)
          throw new ProcessError(`No PORTBLOCK_OFF primitive found in group '${resourceGroup.name}'.`);
  
        return okAsync({ targetPrimitiveId: targetId, portBlockOffId });
      })
    );
  }  
  
  addResourceToGroup(resource: PCSResource, resourceGroup: PCSResourceGroup): ResultAsync<void, ProcessError>  {
        const self = this;
        return new ResultAsync(safeTry(async function * () {
            const currentResourceIndex = PCSResourceTypeInfo[resource.resourceType].orderInGroup;

            const resources = yield * self.fetchResources().safeUnwrap();

            const nextResource = resources
            .filter((resource) => resource.resourceGroup?.name === resourceGroup.name)
            .sort((r1, r2) => PCSResourceTypeInfo[r1.resourceType].orderInGroup - PCSResourceTypeInfo[r2.resourceType].orderInGroup)
            .find((groupResource) => currentResourceIndex <= PCSResourceTypeInfo[groupResource.resourceType].orderInGroup);

            let positionArgument: string[] = [];

            if (nextResource !== undefined) {
                positionArgument = [`--before`, nextResource.name];
            }

            resource.resourceGroup = resourceGroup;
            // console.log(`pcs resource group add '${resourceGroup.name}' ${positionArgument.join(" ")} '${resource.name}'`);
            return self.server.execute(new BashCommand(`pcs resource group add '${resourceGroup.name}' ${positionArgument.join(" ")} '${resource.name}'`)).map(() => undefined);
        }))
    }

    removeResourceFromGroup(resourceGroupName: string, resource: string) {
        return this.server.execute(new BashCommand(`pcs resource ungroup ${resourceGroupName} '${resource}'`))
        .map(() => undefined)

    }

    constrainResourceToGroup(resource: PCSResource, resourceGroup: PCSResourceGroup,server: Server) {
        // console.log(`pcs constraint colocation add '${resource.name}' with '${resourceGroup.name}'`);
        return server.execute(new BashCommand(`pcs constraint colocation add '${resource.name}' with '${resourceGroup.name}'`))
        .map(() => undefined)
    }
    unconstainResourceFromGroup(resourceName:string,resourceGroupName:string) {
        return this.server.execute(new BashCommand(`pcs constraint remove colocation-RBD_${resourceName}-${resourceGroupName}-INFINITY`))
        .map(() => undefined);
    }

    enableResources(resourceName:string) {
        // console.log(`pcs resource enable ${resourceName}`);
        return this.server.execute(new BashCommand(`pcs resource enable ${resourceName} `))
        .map(() => undefined);
    }

    orderResourceBeforeGroup(resource: PCSResource, resourceGroup: PCSResourceGroup) {
        // console.log(`pcs constraint order start '${resource.name}' then '${resourceGroup.name}'`);
        return this.server.execute(new BashCommand(`pcs constraint order start '${resource.name}' then '${resourceGroup.name}'`))
        .map(() => undefined);
    }
    removeResourcefromOrderGroup(resourceName:string,resourceGroupName:string) {
        return this.server.execute(new BashCommand(`pcs constraint remove order-RBD_${resourceName}-${resourceGroupName}-mandatory`))
        .map(() => undefined);
    }

    fetchResourceConfig(resource: Pick<PCSResource, "name">) {
        // console.log(`pcs resource config --output-format json '${resource.name}'`);
        return this.server.execute(new BashCommand(`pcs resource config --output-format json '${resource.name}'`))
        .map((process) => process.getStdout())
        .andThen(safeJsonParse<PCSConfigJson>);
    }

    fetchResourceInstanceAttributeValue(resource: Pick<PCSResource,"name">, nvPairName: string) {
        return this.fetchResourceConfig(resource)
          .map(cfg => cfg.primitives![0]!.instance_attributes![0]!.nvpairs
            .find(pair => pair.name === nvPairName)?.value);
      }
      
    fetchResourceInstanceAttributeValues(resource: Pick<PCSResource, "name">, nvPairName: string[]) {
        return this.fetchResourceConfig(resource).map((config) => {
            let pairResults = new Map<string, string | undefined>();
            for (var pairName of nvPairName) {
                pairResults.set(pairName, config.primitives![0]!.instance_attributes![0]!.nvpairs.find((pair) => pair.name === pairName)?.value);
            
            }

            return pairResults;
        });
    }

    fetchResourceByName(resourceName: string) {
        return this.fetchResources().map((resources) => resources.find((resource) => resource.name === resourceName));
    }

    getTargetGroups(){
    
    }

    fetchResources(): ResultAsync<PCSResource[], ProcessError> {
        if (this.currentResources !== undefined) {
          return okAsync(this.currentResources);
        }
      
        return this.server
          .execute(new BashCommand(`pcs resource config --output-format json`))
          .map(proc => proc.getStdout())
          .andThen(safeJsonParse<PCSConfigJson>)
          .mapErr(err => new ProcessError(`Unable to get current PCS configuration: ${err}`))
          .map((cfg) => {
            const primitives = cfg.primitives ?? [];
            const groups = cfg.groups ?? [];
      
            const resources = primitives
              .map((resource) => {
                const resourceType = this.getResourceTypeOfPCSResource(resource);
                if (!resourceType) return undefined;
      
                const group = groups.find(g => g.member_ids.includes(resource.id));
                const groupObject = group ? new PCSResourceGroup(group.id) : undefined;
      
                // Target resources must be in a group
                if (resourceType !== PCSResourceType.TARGET || groupObject) {
                  return new PCSResource(resource.id,  resourceType, groupObject);
                }
                return undefined;
              })
              .filter((r): r is PCSResource => r !== undefined);
      
            this.currentResources = resources;
            return resources;
          });
      }
      

    getResourceTypeOfPCSResource(resource: PCSResourceConfigJson) {
        for (const type of Object.values(PCSResourceType).filter((value) => typeof value === 'number')){
            const info = PCSResourceTypeInfo[type as PCSResourceType];

            if (info.internalTypeName === resource.agent_name.type) {
                if (info.internalTypeName === "portblock") {
                    for (const attribute of resource.instance_attributes) {
                        for (const nvpair of attribute.nvpairs) {
                            if (nvpair.name === "action") {
                                return nvpair.value === "block" ? PCSResourceType.PORTBLOCK_ON : PCSResourceType.PORTBLOCK_OFF;
                            }
                        }
                    }
                }
                else
                    return type as PCSResourceType;
            }
        }

        return undefined;
    }

    getGenerationCommandForPCSResource(resource: PCSResourceConfigJson) {
        return okAsync(undefined);
        // return this.server.execute(new BashCommand(`pcs resource config '${resource.id}' --output-format cmd`))
        // .map((proc) => new BashCommand(proc.getStdout().replace(/\\\n/g, "").replace(/\n/g, "")));
    }
}
 type PCSResourceConfigJson = {
    id: string,
    agent_name: {
        type: string
    },
    instance_attributes: {
        nvpairs: {
            id: string,
            name: string,
            value: string,
        }[]
    }[]
}
 type PCSConfigJson = {
    primitives: PCSResourceConfigJson[],
    groups: {
        id: string,
        member_ids: string[]
    }[]
}