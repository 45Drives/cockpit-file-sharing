import type { PCSResourceGroup } from "@/tabs/iSCSI/types/cluster/PCSResourceGroup";
import type { Command } from "@45drives/houston-common-lib";

export class PCSResource {
    name: string;
    generationCommand: Command;
    resourceType: PCSResourceType;
    resourceGroup: PCSResourceGroup | undefined;

    constructor(name: string, generationCommand: Command, type: PCSResourceType, group?: PCSResourceGroup) {
        this.name = name;
        this.generationCommand = generationCommand;
        this.resourceType = type
        this.resourceGroup = group;
    }
}

export enum PCSResourceType {
    PORTBLOCK_ON,
    VIP,
    LVM,
    TARGET,
    LUN ,
    PORTBLOCK_OFF,
    RBD,
}

interface PCSResourceInfo {
    namePrefix: string,
    internalTypeName: string,
    orderInGroup: number;
}

export const PCSResourceTypeInfo: { [key in PCSResourceType]: PCSResourceInfo } = {
    [PCSResourceType.PORTBLOCK_ON]: {
        namePrefix: "iscsi_portblock_on",
        internalTypeName: "portblock",
        orderInGroup: 0,
    },
    [PCSResourceType.VIP]: {
        namePrefix: "iscsi_vip",
        internalTypeName: "IPaddr2",
        orderInGroup: 1,
    },
    [PCSResourceType.LVM]: {
        namePrefix: "iscsi_lvm",
        internalTypeName: "LVM_activate",
        orderInGroup: 2,
    },
    [PCSResourceType.TARGET]: {
        namePrefix: "iscsi_target",
        internalTypeName: "iSCSITarget",
        orderInGroup: 3,
    },
    [PCSResourceType.LUN]: {
        namePrefix: "iscsi_lun",
        internalTypeName: "iSCSILogicalUnit",
        orderInGroup: 4,
    },
    [PCSResourceType.PORTBLOCK_OFF]: {
        namePrefix: "iscsi_portblock_off",
        internalTypeName: "portblock",
        orderInGroup: 5,
    },
    [PCSResourceType.RBD]: {
        namePrefix: "rbd",
        internalTypeName: "rbd",
        orderInGroup: 6,
    },
}

