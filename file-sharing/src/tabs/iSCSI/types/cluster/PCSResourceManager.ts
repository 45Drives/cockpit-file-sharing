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

    createResource(name: string, creationArugments: string, type: PCSResourceType,server: Server) {
        const resourceName = name.replace(':', '_');

        const creationCommand = new BashCommand(`pcs resource create '${resourceName}' ${creationArugments}`);
        return server.execute(creationCommand)
        .map(() => {
            const resource = new PCSResource(resourceName, /* creationCommand, */ type);
            this.currentResources = [...this.currentResources!, resource];
    
            return resource;
        })
    }

    deleteResource(resource: Pick<PCSResource, "name">) {
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
            return self.server.execute(new BashCommand(`pcs resource group add '${resourceGroup.name}' ${positionArgument.join(" ")} '${resource.name}'`)).map(() => undefined);
        }))
    }

    removeResourceFromGroup(resourceGroupName: string, resource: string) {
        return this.server.execute(new BashCommand(`pcs resource ungroup ${resourceGroupName} '${resource}'`))
        .map(() => undefined)

    }

    constrainResourceToGroup(resource: PCSResource, resourceGroup: PCSResourceGroup,server: Server) {
        return server.execute(new BashCommand(`pcs constraint colocation add '${resource.name}' with '${resourceGroup.name}'`))
        .map(() => undefined)
    }
    unconstainResourceFromGroup(resourceName:string,resourceGroupName:string) {
        return this.server.execute(new BashCommand(`pcs constraint remove colocation-RBD_${resourceName}-${resourceGroupName}-INFINITY`))
        .map(() => undefined);
    }

    orderResourceBeforeGroup(resource: PCSResource, resourceGroup: PCSResourceGroup) {
        return this.server.execute(new BashCommand(`pcs constraint order start '${resource.name}' then '${resourceGroup.name}'`))
        .map(() => undefined);
    }
    removeResourcefromOrderGroup(resourceName:string,resourceGroupName:string) {
        return this.server.execute(new BashCommand(`pcs constraint remove order-RBD_${resourceName}-${resourceGroupName}-mandatory`))
        .map(() => undefined);
    }

    fetchResourceConfig(resource: Pick<PCSResource, "name">) {
        return this.server.execute(new BashCommand(`pcs resource config --output-format json '${resource.name}'`))
        .map((process) => process.getStdout())
        .andThen(safeJsonParse<PCSConfigJson>);
    }

    fetchResourceInstanceAttributeValue(resource: Pick<PCSResource, "name">, nvPairName: string) {
        const result =        this.fetchResourceConfig(resource).map((config) => config.primitives![0]!.instance_attributes![0]!.nvpairs.find((pair) => pair.name === nvPairName)?.value);
        return this.fetchResourceConfig(resource).map((config) => config.primitives![0]!.instance_attributes![0]!.nvpairs.find((pair) => pair.name === nvPairName)?.value);

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

    // fetchResources() {
    //     if (this.currentResources === undefined) {
    //         return this.server.execute(new BashCommand(`pcs resource config --output-format json`))
    //         .map((process) => process.getStdout())
    //         .andThen(safeJsonParse<PCSConfigJson>)
    //         .mapErr((err) => new ProcessError(`Unable to get current PCS configuration: ${err}`))
    //         .map((partialObject) => {
    //             return partialObject.primitives!.map((resource) => {
    //                 return this.getGenerationCommandForPCSResource(resource)
    //                 .map((command) => {
    //                     const resourceType = this.getResourceTypeOfPCSResource(resource);

    //                     if (resourceType !== undefined) {
    //                         let groupObject = undefined;
    //                         const group = partialObject.groups!.find((value) => value.member_ids.includes(resource.id));

    //                         if (group !== undefined) {
    //                             groupObject = new PCSResourceGroup(group.id);
    //                         }
    //                         // Target Resources require a resource group.
    //                         if (resourceType !== PCSResourceType.TARGET || (resourceType === PCSResourceType.TARGET && groupObject !== undefined))
    //                             return new PCSResource(resource.id, /* command, */ resourceType, groupObject);                        }

    //                     return undefined;
    //                 })
    //             })
    //         })
    //         .andThen((resourceMap) => ResultAsync.combine(resourceMap).map((resourceList) => resourceList.filter((resource) => resource !== undefined)) as ResultAsync<PCSResource[], ProcessError>)
    //         .map((resources) => {
    //             this.currentResources = resources;
    //             return resources;
    //         });
    //     }

    //     return okAsync(this.currentResources!);
    // }
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
        return this.server.execute(new BashCommand(`pcs resource config '${resource.id}' --output-format cmd`))
        .map((proc) => new BashCommand(proc.getStdout().replace(/\\\n/g, "").replace(/\n/g, "")));
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