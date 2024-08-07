import { ResultAsync } from 'neverthrow';
import { PCSResource, PCSResourceType, PCSResourceTypeInfo } from "@/tabs/iSCSI/types/cluster/PCSResource";
import { PCSResourceGroup } from '@/tabs/iSCSI/types/cluster/PCSResourceGroup';
import { BashCommand, Command, ProcessError, safeJsonParse, type Server } from "@45drives/houston-common-lib";

export class PCSResourceManager {

    server: Server;

    currentResources: PCSResource[];
    currentResourceGroups: PCSResourceGroup[];

    constructor(server: Server) {
        this.server = server;

        this.currentResources = [];
        this.currentResourceGroups = [];
    }

    initialize() {
        return this.fetchResources()
        .map((resources) => {
            this.currentResources = resources;
            this.currentResourceGroups = resources.filter(resource => resource.resourceGroup !== undefined).map((resource) => resource.resourceGroup!);
        })

    }

    createResource(name: string, generationCommand: Command, type: PCSResourceType) {
        return this.server.execute(generationCommand)
        .map(() => {
            const resource = new PCSResource(name, generationCommand, type);
            this.currentResources.push(resource);
            return resource;
        })
    }

    deleteResource(resource: PCSResource) {
        return this.server.execute(new BashCommand(`pcs delete ${resource.name}`))
        .map(() => {
            this.currentResources = this.currentResources.filter((existingResource) => existingResource !== resource);
            return undefined;
        })
    }

    updateResource(resource: PCSResource, parameters: String) {
        return this.server.execute(new BashCommand(`pcs update ${resource.name} ${parameters}`))
        .map(() => undefined)
    }

    getResourceConfig(resource: PCSResource) {
        return this.server.execute(new BashCommand(`pcs resource config --output-format json ${resource.name}`))
        .map((proc) => proc.getStdout())
    }

    addResourceToGroup(resource: PCSResource, resourceGroup: PCSResourceGroup) {
        const currentResourceIndex = PCSResourceTypeInfo[resource.resourceType].orderInGroup;

        let positionArgument: string[] = [];

        const nextResource = this.currentResources.find(
          (existingResource) =>
            currentResourceIndex <= PCSResourceTypeInfo[existingResource.resourceType].orderInGroup
        );

        if (nextResource !== undefined) {
          positionArgument = [`--before`, nextResource.name];
        }

        return this.server.execute(new Command([`pcs resource group add ${resourceGroup.name}}`, ...positionArgument, resource.name]))
        .map(() => undefined)
    }

    constrainResourceToGroup(resource: PCSResource, resourceGroup: PCSResourceGroup) {
        return this.server.execute(new BashCommand(`pcs constraint colocation add ${resource.name} with ${resourceGroup.name}`))
        .map(() => undefined)
    }

    orderResourceBeforeGroup(resource: PCSResource, resourceGroup: PCSResourceGroup) {
        return this.server.execute(new BashCommand(`pcs constraint order start ${resource.name} then ${resourceGroup.name}`))
        .map(() => undefined)
    }

    fetchResourceConfig(resource: PCSResource) {
        return this.server.execute(new BashCommand(`pcs resource config --output-format json ${resource.name}`))
        .map((process) => process.getStdout())
        .andThen(safeJsonParse<PCSResourceConfigJson>);
    }

    fetchResources(){
        return this.server.execute(new BashCommand(`pcs resource config --output-format json`))
        .map((process) => process.getStdout())
        .andThen(safeJsonParse<PCSConfigJson>)
        .mapErr((err) => new ProcessError(`Unable to get current PCS configuration: ${err}`))
        .map((partialObject) => {
            return partialObject.primitives!.map((resource) => {
                return this.getGenerationCommandForPCSResource(resource)
                .map((command) => {
                    const resourceType = this.getResourceTypeOfPCSResource(resource);

                    if (resourceType !== undefined) {
                        let groupObject = undefined;
                        const groupName = partialObject.groups!.find((value) => value.member_ids.includes(resource.id))?.id;

                        if (groupName !== undefined) {
                            groupObject = new PCSResourceGroup(groupName);
                        }

                        return new PCSResource(resource.id, command, resourceType, groupObject);
                    }

                    return undefined;
                })
            })
        })
        .andThen((resourceMap) => ResultAsync.combine(resourceMap).map((resourceList) => resourceList.filter((resource) => resource !== undefined))) as ResultAsync<PCSResource[], ProcessError>;
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
        return this.server.execute(new BashCommand(`pcs resource config ${resource.id} --output-format cmd`))
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