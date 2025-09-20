import { PCSResourceType, PCSResourceTypeInfo } from '@/tabs/iSCSI/types/cluster/PCSResource';
import { PCSResourceManager } from './../cluster/PCSResourceManager';
import { RBDManager } from './../cluster/RBDManager';
import { ConfigurationManager } from "@/tabs/iSCSI/types/ConfigurationManager";
import { VirtualDevice, DeviceType } from "@/tabs/iSCSI/types/VirtualDevice";
import { CHAPConfiguration, CHAPType } from "@/tabs/iSCSI/types/CHAPConfiguration";
import { type Connection } from "@/tabs/iSCSI/types/Connection";
import { Initiator } from "@/tabs/iSCSI/types/Initiator";
import { InitiatorGroup } from "@/tabs/iSCSI/types/InitiatorGroup";
import { LogicalUnitNumber } from "@/tabs/iSCSI/types/LogicalUnitNumber";
import { Portal } from "@/tabs/iSCSI/types/Portal";
import { type Session } from "@/tabs/iSCSI/types/Session";
import { type Target } from "@/tabs/iSCSI/types/Target";
import { ISCSIDriver } from "@/tabs/iSCSI/types/drivers/ISCSIDriver";
import {
    BashCommand,
    Command,
    Directory,
    ProcessError,
    safeJsonParse,
    server,
    Server,
    StringToIntCaster,
} from "@45drives/houston-common-lib";
import { ResultAsync, err, errAsync, ok, okAsync, safeTry } from "neverthrow";
import { useUserSettings } from "@/common/user-settings";
import { ISCSIDriverSingleServer } from "@/tabs/iSCSI/types/drivers/ISCSIDriverSingleServer";
import { PCSResource } from '@/tabs/iSCSI/types/cluster/PCSResource';
import { PCSResourceGroup } from '@/tabs/iSCSI/types/cluster/PCSResourceGroup';
import { RadosBlockDevice } from '@/tabs/iSCSI/types/cluster/RadosBlockDevice';
import { LogicalVolume } from '@/tabs/iSCSI/types/cluster/LogicalVolume';
import { Result } from 'postcss';
import { PhysicalVolume } from '../cluster/PhysicalVolume';
import { VolumeGroup } from '../cluster/VolumeGroup';
import { log } from 'console';

const userSettingsResult = ResultAsync.fromSafePromise(useUserSettings(true));

export class ISCSIDriverClusteredServer implements ISCSIDriver {
    server: Server;
    configurationManager: ConfigurationManager;
    rbdManager: RBDManager;
    pcsResourceManager: PCSResourceManager;

    singleServerDriver: ISCSIDriverSingleServer | undefined;

    targets: Target[];
    virtualDevices: VirtualDevice[];

    deviceTypeToHandlerDirectory = {
        [DeviceType.BlockIO]: "/sys/kernel/scst_tgt/handlers/vdisk_blockio",
    };

    targetManagementDirectory = "/sys/kernel/scst_tgt/targets/iscsi";

      resourceNamePrefix = "iscsi"
    resourceGroupPrefix = "iscsi_group";

    constructor(server: Server) {
        this.server = server;
        this.configurationManager = new ConfigurationManager(server);
        this.rbdManager = new RBDManager(server);
        this.pcsResourceManager = new PCSResourceManager(server);
        this.virtualDevices = [];
        this.targets = [];
        // console.log(" primary constructor server ", server);
    }
    initialize() {
        return new Directory(this.server, "/sys/kernel/scst_tgt").exists()
            .andThen((exists) => {
                if (!exists) {
                    return err(new ProcessError("/sys/kernel/scst_tgt was not found. Is SCST installed?"));
                }
                const primaryServer = this.server;
                // Initialize core managers with the primary server
                this.server = primaryServer;
                this.singleServerDriver = new ISCSIDriverSingleServer(primaryServer);
                this.configurationManager = new ConfigurationManager(primaryServer);
                this.rbdManager = new RBDManager(primaryServer);
                this.pcsResourceManager = new PCSResourceManager(primaryServer);
                // Fetch virtual devices after setting up the server
                return this.rbdManager.initialize()
                .andThen(() => this.getExistingVirtualDevices())
                .map((devices) => this.virtualDevices.push(...devices))
                .map(() => this);
        });

    }

    getHandledDeviceTypes(): DeviceType[] {
        return Object.keys(this.deviceTypeToHandlerDirectory) as DeviceType[];
    }
    
    getnode(): ResultAsync<Server | undefined, ProcessError> {
        const node = this.rbdManager.allServers[0];
        return ResultAsync.fromSafePromise(Promise.resolve(node));
      }

    addVirtualDevice(virtualDevice: VirtualDevice): ResultAsync<void, ProcessError> {
        this.virtualDevices = [...this.virtualDevices, virtualDevice];
        return okAsync(undefined);
    }

    removeVirtualDevice(virtualDevice: VirtualDevice): ResultAsync<void, ProcessError> {
        if (virtualDevice.assigned) {
            return errAsync(new ProcessError("Cannot delete assigned devices in clustered environment."));
        } else {
            this.virtualDevices = this.virtualDevices.filter((existingDevice) => existingDevice.deviceName !== virtualDevice.deviceName);
            return okAsync(undefined);
        }
    }


    createTarget(target: Target): ResultAsync<void, ProcessError> {
        const targetResourceName = `${this.resourceNamePrefix}_TARGET_${target.name}`;
        const creationArugments = `ocf:heartbeat:iSCSITarget iqn=${target.name} op start timeout=20 op stop timeout=20 op monitor interval=20 timeout=40`;
        return this.pcsResourceManager.createResource(targetResourceName, creationArugments, PCSResourceType.TARGET,server)
            .andThen((resource) => {
                target.devicePath = resource.name;
                return this.pcsResourceManager.addResourceToGroup(resource, new PCSResourceGroup(`${this.resourceGroupPrefix}_${resource.name}`))
            })
            .map(() => target.initiatorGroups.push(new InitiatorGroup("allowed", [], [], targetResourceName)))
            .map(() => undefined)
    }

    removeTarget(target: Target): ResultAsync<void, ProcessError> {
        const self = this;
        console.log("removeTarget" , target.initiatorGroups)
        return new ResultAsync(safeTry(async function* () {
            for (let group of target.initiatorGroups) {
                for (let lun of group.logicalUnitNumbers) {

                    yield* self.removeLogicalUnitNumberFromGroup(group, lun).safeUnwrap();
                }
            }

            const targetResource = yield* self.findTargetPCSResource(target).safeUnwrap();

            yield* self.pcsResourceManager.deleteResourceGroup(targetResource.resourceGroup!).safeUnwrap();

            return okAsync(undefined);
        }))
    }

    addPortalToTarget(target: Target, portal: Portal) {
        return userSettingsResult.andThen((userSettings) => {
            const createdResources: PCSResource[] = [];

            const updatedPortalList = [...target.portals.map((targetPortal) => targetPortal.address), portal.address + ":3260"].join(", ");

            const vipCreationArugments = `ocf:heartbeat:IPaddr2 ip=${portal.address} cidr_netmask=${userSettings.value.iscsi.subnetMask.toString()} op start timeout=20 op stop timeout=20 op monitor interval=10`;
            const portblockOnCreationArugments = `ocf:heartbeat:portblock ip=${portal.address} portno=3260 protocol=tcp action=block op start timeout=20 op stop timeout=20 op monitor timeout=20 interval=20`;
            const portblockOffCreationArugments = `ocf:heartbeat:portblock ip=${portal.address} portno=3260 protocol=tcp action=unblock op start timeout=20 op stop timeout=20 op monitor timeout=20 interval=20`;

            return this.findTargetPCSResource(target)
                .andThen((targetResource) => this.pcsResourceManager.createResource(`${this.resourceNamePrefix}_VIP_${portal.address}`, vipCreationArugments, PCSResourceType.VIP,server)
                    .andThen((vipResource) => {
                        createdResources.push(vipResource);
                        return this.pcsResourceManager.addResourceToGroup(vipResource, targetResource.resourceGroup!);
                    })
                    .andThen(() => this.pcsResourceManager.createResource(`${this.resourceNamePrefix}_PORTBLOCKON_${portal.address}`, portblockOnCreationArugments, PCSResourceType.PORTBLOCK_ON,server))
                    .andThen((portBlockResource) => {
                        createdResources.push(portBlockResource);
                        return this.pcsResourceManager.addResourceToGroup(portBlockResource, targetResource.resourceGroup!);
                    })
                    .andThen(() => this.pcsResourceManager.createResource(`${this.resourceNamePrefix}_PORTBLOCKOFF_${portal.address}`, portblockOffCreationArugments, PCSResourceType.PORTBLOCK_OFF,server))
                    .andThen((portBlockResource) => {
                        createdResources.push(portBlockResource);
                        return this.pcsResourceManager.addResourceToGroup(portBlockResource, targetResource.resourceGroup!);
                    })
                    .andThen(() => this.pcsResourceManager.updateResource(targetResource, `portals='${updatedPortalList}'`))
                )
                .mapErr((err) => {
                    createdResources.forEach((resource) => this.pcsResourceManager.deleteResource(resource))
                    return err;
                });
        });
    }

    deletePortalFromTarget(target: Target, portal: Portal): ResultAsync<void, ProcessError> {
        return this.findTargetPCSResource(target)
            .andThen((targetResource) => {
                const updatedPortalList = target.portals.filter((existingPortal) => existingPortal !== portal).map((existingPortal) => existingPortal.address).join(", ");

                return this.pcsResourceManager.updateResource(targetResource, `portals='${updatedPortalList}'`)
                    .andThen(() => this.findPortblockPCSResource(target, portal, PCSResourceType.PORTBLOCK_OFF))
                    .andThen((resource) => {
                        if (resource !== undefined) {
                            return this.pcsResourceManager.deleteResource(resource);
                        }

                        return okAsync(undefined);
                    })
                    .andThen(() => this.findPortblockPCSResource(target, portal, PCSResourceType.PORTBLOCK_ON))
                    .andThen((resource) => {
                        if (resource !== undefined) {
                            return this.pcsResourceManager.deleteResource(resource);
                        }

                        return okAsync(undefined);
                    })
                    .andThen(() => this.findPortblockVIPResource(target, portal))
                    .andThen((resource) => {
                        if (resource !== undefined) {
                            return this.pcsResourceManager.deleteResource(resource);
                        }

                        return okAsync(undefined);
                    })
            })
    }

    // Only group available is created by default by the Target resource, called 'allowed'
    addInitiatorGroupToTarget(
        _target: Target,
        _initiatorGroup: InitiatorGroup
    ): ResultAsync<void, ProcessError> {
        throw new Error("Adding initiator groups is not supported by this driver.");
    }

    // Only group available is created by default by the Target resource, called 'allowed'
    deleteInitiatorGroupFromTarget(
        _target: Target,
        _initiatorGroup: InitiatorGroup
    ): ResultAsync<void, ProcessError> {
        throw new Error("Removing initiator groups is not supported by this driver.");
    }

    addInitiatorToGroup(
        initiatorGroup: InitiatorGroup,
        initiator: Initiator
    ): ResultAsync<void, ProcessError> {
        const updatedInitiatorList = [...initiatorGroup.initiators, initiator].map((initiator) => initiator.name).join(" ");

        return this.pcsResourceManager.fetchResourceByName(initiatorGroup.devicePath)
            .andThen((targetResource) => {
                if (targetResource !== undefined)
                    return this.pcsResourceManager.updateResource(targetResource, `allowed_initiators='${updatedInitiatorList}'`)

                return errAsync(new ProcessError("Could not find Target resource."))
            })
    }

    removeInitiatorFromGroup(
        initiatorGroup: InitiatorGroup,
        initiator: Initiator
    ): ResultAsync<void, ProcessError> {
        const updatedInitiatorList = initiatorGroup.initiators.filter((existinginitiator) => existinginitiator !== initiator).map((existinginitiator) => existinginitiator.name).join(" ");

        return this.pcsResourceManager.fetchResourceByName(initiatorGroup.devicePath)
            .andThen((targetResource) => {
                if (targetResource !== undefined)
                    return this.pcsResourceManager.updateResource(targetResource, `allowed_initiators='${updatedInitiatorList}'`)

                return errAsync(new ProcessError("Could not find Target resource."))
            })
    }

    addLogicalUnitNumberToGroup(
        initiatorGroup: InitiatorGroup,
        logicalUnitNumber: LogicalUnitNumber
    ): ResultAsync< Server, ProcessError> {
        const self = this;
        return this.pcsResourceManager.fetchResourceByName(initiatorGroup.devicePath)
            .andThen((targetResource) => {
                
                if (targetResource !== undefined) {
                    return new ResultAsync(safeTry(async function* () {
                        const targetIQN = yield* self.pcsResourceManager.fetchResourceInstanceAttributeValue(targetResource, "iqn").safeUnwrap();
                        if( logicalUnitNumber.blockDevice?.vgName === undefined) {
                            if(logicalUnitNumber.blockDevice! instanceof LogicalVolume) {
                                yield* self.createAndConfigureLVResources(logicalUnitNumber, targetIQN!, targetResource.resourceGroup!).safeUnwrap();
                            }
                            else{
                                const lvPath = logicalUnitNumber.blockDevice!.filePath;
                                const pathParts = lvPath.split("/");
                
                               if (pathParts.length < 4) {
                                 throw new Error(`Invalid block device path: ${lvPath}`);
                                }
       
                                const vgname = pathParts[2];
                                const lvname = pathParts[3];
                                const server = logicalUnitNumber.blockDevice.server;
                                console.log("adding from else block ", logicalUnitNumber, vgname, lvname, server);
                               if (vgname && lvname && server) {
                                   const logicalVolume = yield* self.resolveLogicalVolume(vgname, lvname,server).safeUnwrap();
                                    logicalUnitNumber.blockDevice = logicalVolume;
                                    }

                    
                            yield* self.createAndConfigureLVResources(logicalUnitNumber, targetIQN!, targetResource.resourceGroup!).safeUnwrap();
                            if (logicalUnitNumber.blockDevice?.server) {
                                logicalUnitNumber.blockDevice.server = self.rbdManager.allServers[0];
                            }
                        }
                        }
                       else  if (logicalUnitNumber.blockDevice! instanceof RadosBlockDevice) {

                            yield* self.createAndConfigureRBDResource(logicalUnitNumber, targetIQN!, targetResource.resourceGroup!).safeUnwrap();
                        }
                        const execServer =  self.rbdManager.allServers[0];
                        console.log("execserver ", server)
                        console.log("Adding Logical Unit Number to group: ", logicalUnitNumber);
                        return okAsync(execServer);
                    }))
                }

                return errAsync(new ProcessError("Could not find Target resource."))
            })
    }
    
    resolveLogicalVolume(vgname: string, lvname: string,server:Server): ResultAsync<LogicalVolume, Error> {
        const self = this;
        console.log("resolvelogicalvolume",server)
        return server.execute(new BashCommand(`lvs --reportformat json --units B`))
            .map((proc) => proc.getStdout())
            .andThen(safeJsonParse<LogicalVolumeInfoJson>)
            .map((lvData) => {
                const lvs = lvData?.report?.flatMap((r) => r.lv) ?? [];
                const match = lvs.find((lv) => lv.lv_name === lvname && lv.vg_name === vgname);
                console.log("match",match)
                console.log("lvs",lvs)
                if (!match) throw new Error(`Logical volume ${vgname}/${lvname} not found`);
                return match;
            })
            .andThen((lvInfo) =>
                server.execute(new BashCommand(`pvs -S vgname=${vgname} --reportformat json --units B`))
                    .map((proc) => proc.getStdout())
                    .andThen(safeJsonParse<VolumeGroupInfoJson>)
                    .map((pvData) => pvData?.report?.flatMap((r) => r.pv) ?? [])
                    .andThen((pvList) =>   new ResultAsync<LogicalVolume, Error>(safeTry(async function* () {
                        const mappedBlockDevices = yield* self.rbdManager.fetchAvaliableRadosBlockDevices().safeUnwrap();
                        console.log("mappedBlockDevices", mappedBlockDevices)
                        console.log("server", server)
                        console.log("pvList", pvList)
                        
                        const physicalVolumes = pvList.flatMap((pv) =>
                            mappedBlockDevices.find((rbd) => rbd.filePath === pv.pv_name && rbd.server.host == server.host)
                        )
                        .filter((rbd): rbd is RadosBlockDevice => rbd !== undefined)
                        .map((rbd) => new PhysicalVolume(rbd));
                        
                        console.log("physicalVolumes", physicalVolumes)
                        const vg = new VolumeGroup(vgname, physicalVolumes,server);
                        const lv = new LogicalVolume(
                            lvname,
                            0,
                            vg,
                            StringToIntCaster()(lvInfo.lv_size).some(),
                            server
                        );
                        return okAsync(lv);
                    })))
            );
    }

    // removeLogicalUnitNumberFromGroup(
    //     initiatorGroup: InitiatorGroup,
    //     logicalUnitNumber: LogicalUnitNumber
    // ): ResultAsync<void, ProcessError> {
    //     const self = this;
    //     console.log("hello from removeLogicalUnitNumberFromGroup")
    //     return this.pcsResourceManager.fetchResourceByName(initiatorGroup.devicePath)
    //         .andThen((targetResource) => new ResultAsync(safeTry(async function* () {
    //             const targetIQN = yield* self.pcsResourceManager.fetchResourceInstanceAttributeValue(targetResource!, "iqn").safeUnwrap();
    //             if(logicalUnitNumber.blockDevice?.vgName=== undefined) {

    //             }
    //             if (logicalUnitNumber.blockDevice! instanceof RadosBlockDevice) {
    //                 console.log("removing from RadosBlockDevice block ", logicalUnitNumber)

    //                 yield* self.removeRBDAndRelatedResource(logicalUnitNumber, targetIQN!).safeUnwrap();
    //             }
    //             else if (logicalUnitNumber.blockDevice! instanceof LogicalVolume) {
    //                 console.log("removing from LogicalVolume block ", logicalUnitNumber)

    //                 yield* self.removeLVAndRelatedResources(logicalUnitNumber, targetIQN!).safeUnwrap();
    //             }
    //             else {
    //                 console.log("removing from else block ", logicalUnitNumber)
    //                 yield* self.removeLUNResource(logicalUnitNumber, targetIQN!).safeUnwrap();
    //             }

    //             return okAsync(undefined)
    //         })));
    // }
    removeLogicalUnitNumberFromGroup(
        initiatorGroup: InitiatorGroup,
        logicalUnitNumber: LogicalUnitNumber
      ): ResultAsync<void, ProcessError> {
        const self = this;
      
        return this.pcsResourceManager.fetchResourceByName(initiatorGroup.devicePath)
          .andThen((targetResource) =>
            new ResultAsync(safeTry(async function* () {
              const targetIQN = yield* self.pcsResourceManager
                .fetchResourceInstanceAttributeValue(targetResource!, "iqn")
                .safeUnwrap();
      
              if (logicalUnitNumber.blockDevice?.vgName === undefined) {
                if (logicalUnitNumber.blockDevice instanceof LogicalVolume) {
                  yield* self.removeLVAndRelatedResources(logicalUnitNumber, targetIQN!).safeUnwrap();
                } else {
                  const lvPath = logicalUnitNumber.blockDevice!.filePath;
                  const pathParts = lvPath.split("/");
      
                  if (pathParts.length < 4) {
                    throw new Error(`Invalid block device path: ${lvPath}`);
                  }
      
                  const vgname = pathParts[2];
                  const lvname = pathParts[3];
                  let server = logicalUnitNumber.blockDevice?.server;
                  console.log("removing from else block ", logicalUnitNumber, vgname, lvname, server);
                  console.log("self.server", self.server);

                  if (vgname && lvname && server) {
                    const logicalVolume = yield* self.resolveLogicalVolume(vgname, lvname,server).safeUnwrap();
                    logicalUnitNumber.blockDevice = logicalVolume;
                  }
      
                  yield* self.removeLVAndRelatedResources(logicalUnitNumber, targetIQN!).safeUnwrap();
                }
              } else if (logicalUnitNumber.blockDevice instanceof RadosBlockDevice) {
                yield* self.removeRBDAndRelatedResource(logicalUnitNumber, targetIQN!).safeUnwrap();
              } else {
                yield* self.removeLUNResource(logicalUnitNumber, targetIQN!).safeUnwrap();
              }
              console.log("Removing Logical Unit Number from group: ", logicalUnitNumber);
              return ok(undefined);
            }))
          )
          .andThen(() => {
            console.log("Cleaning up resources after removing Logical Unit Number ", this.server);
            return this.server
              .execute(new BashCommand(`pcs resource cleanup`))
              .map(() => undefined); // Ensures return type matches: ResultAsync<void, ProcessError>
          });
      }
      

    addCHAPConfigurationToTarget(
        target: Target,
        chapConfiguration: CHAPConfiguration
    ): ResultAsync<void, ProcessError> {
        return this.findTargetPCSResource(target)
            .andThen((targetResource) => this.pcsResourceManager.updateResource(targetResource, `incoming_username='${chapConfiguration.username}' incoming_password='${chapConfiguration.password}'`))
    }

    removeCHAPConfigurationFromTarget(
        target: Target,
        _chapConfiguration: CHAPConfiguration
    ): ResultAsync<void, ProcessError> {
        return this.findTargetPCSResource(target)
            .andThen((targetResource) => this.pcsResourceManager.updateResource(targetResource, `incoming_username='' incoming_password=''`))
    }

    getVirtualDevices(): ResultAsync<VirtualDevice[], ProcessError> {
        return okAsync(this.virtualDevices);
    }

    getExistingVirtualDevices(): ResultAsync<VirtualDevice[], ProcessError> {
        const self = this;

        return new ResultAsync(safeTry(async function* () {
            const foundDevices: VirtualDevice[] = [];

            const availableLogicalVolumes = yield* self.rbdManager.fetchAvaliableLogicalVolumes().safeUnwrap();
            // console.log("availableLogicalVolumes", availableLogicalVolumes);
          //  const availableRadosBlockDevices = yield* self.rbdManager.fetchAvaliableRadosBlockDevices().safeUnwrap();
            const resources = yield* self.pcsResourceManager.fetchResources().safeUnwrap();

            // Track paths used in LUNs
            const assignedPaths = new Set<string>();

            // === 1. Parse LUN resources to identify assigned devices ===
            for (let resource of resources.filter((r) => r.resourceType === PCSResourceType.LUN)) {
                const attributes = yield* self.pcsResourceManager.fetchResourceInstanceAttributeValues(resource, ["path"]).safeUnwrap();
                const path = attributes.get("path");
                if (!path) continue;

                assignedPaths.add(path);

                // Try to match Logical Volume
                const lv = availableLogicalVolumes.find((vol) => vol.filePath === path);
                if (lv) {
                    foundDevices.push(new VirtualDevice(lv.deviceName, lv.filePath, lv.blockSize, lv.deviceType,lv.maximumSize, true,undefined,lv.server));

                    continue;
                }
                // // Try to match RBD
                // const rbd = availableRadosBlockDevices.find((r) => r.filePath === path);
                // if (rbd) {
                //     rbd.assigned = true;
                //     foundDevices.push(rbd);
                //     continue;
                // }
                // Fallback unknown BlockIO device
                const blockSizeResult = await self.rbdManager.getBlockSizeFromDevicePath(path,server);
                const blockSize = blockSizeResult.isOk() ? blockSizeResult.value : 0;

                foundDevices.push(new VirtualDevice(path, path, blockSize, DeviceType.BlockIO,0,true,undefined,server));

            }

            // === 2. Add all UNASSIGNED RBDs ===
            // for (let rbd of availableRadosBlockDevices) {
            //     if (!assignedPaths.has(rbd.filePath)) {
            //         console.log("checking rbd", rbd, assignedPaths);

            //         foundDevices.push(new VirtualDevice(rbd.deviceName, rbd.filePath, rbd.blockSize, rbd.deviceType, false,rbd.vgName,rbd.server));

            //     }
            // }

            // === 3. Add all UNASSIGNED Logical Volumes ===
            for (let lv of availableLogicalVolumes) {
                if (!assignedPaths.has(lv.filePath)) {
                    foundDevices.push(new VirtualDevice(lv.deviceName, lv.filePath, lv.blockSize, lv.deviceType,lv.maximumSize, false,undefined,lv.server));

                }
            }
            console.log("foundDevices", foundDevices);
            return ok(foundDevices);
        }));
    }


    getTargets(): ResultAsync<Target[], ProcessError> {
        const self = this;
        
        return this.pcsResourceManager.fetchResources()
            .map((resources) => resources.filter((resource) => resource.resourceType === PCSResourceType.TARGET))
            .andThen((filteredResources) => ResultAsync.combine(
                filteredResources.map((resource) =>
                    new ResultAsync(safeTry(async function* () {
                        const targetIQN = yield* self.pcsResourceManager.fetchResourceInstanceAttributeValue(resource, "iqn").safeUnwrap();

                        const partialTarget = {
                            name: targetIQN!,
                            devicePath: resource.name
                        };

                        return ok<Target>({
                            ...partialTarget,
                            portals: yield* self.getPortalsOfTarget(partialTarget).safeUnwrap(),
                            chapConfigurations: yield* self.getCHAPConfigurationsOfTarget(partialTarget).safeUnwrap(),
                            initiatorGroups: yield* self.getInitatorGroupsOfTarget(partialTarget).safeUnwrap(),
                            sessions: yield* self.getSessionsOfTarget(partialTarget).safeUnwrap()
                        });
                    }))
                )
            ))
    }

    getPortalsOfTarget(target: Pick<Target, "name" | "devicePath">): ResultAsync<Portal[], ProcessError> {
        return this.findTargetPCSResource(target)
            .andThen((targetResource) => this.pcsResourceManager.fetchResourceInstanceAttributeValue(targetResource, "portals"))
            .map((portalsString) => {
                if (portalsString !== undefined)
                    return portalsString!.split(", ").map((portalAddress) => new Portal(portalAddress));

                return [];
            })
    }



    // iSCSI through PCS only seems to support one ini_group 'allowed', that is created automatically.
    // getInitatorGroupsOfTarget(target: Pick<Target, "name" | "devicePath">): ResultAsync<InitiatorGroup[], ProcessError> {
    //     const self = this;

    //     return this.findTargetPCSResource(target)
    //         .andThen((resource) => new ResultAsync(safeTry(async function* () {
    //             const partialInitiatorGroup = {
    //                 name: "allowed",
    //                 devicePath: resource.name,
    //             }
    //             let attributes = yield* self.pcsResourceManager.fetchResourceInstanceAttributeValues({ name: resource.name }, ["initiator_groups"]).safeUnwrap();

    //             console.log("target attributes", attributes)
    //             console.log("resource", resource)
    //             return ok<InitiatorGroup[]>([{
    //                 ...partialInitiatorGroup,
    //                 logicalUnitNumbers: yield* self.getLogicalUnitNumbersOfInitiatorGroup(partialInitiatorGroup).safeUnwrap(),
    //                 initiators: yield* self.getInitiatorsOfInitiatorGroup(partialInitiatorGroup).safeUnwrap()
    //             }])
    //         })))
    // }
// top-level helper (or make it `private parseInitiatorGroups(...)` in the class)
//  parseInitiatorGroups(attr?: string): Map<string, string[]> {
//     const out = new Map<string, string[]>();
//     if (!attr) return out;
  
//     for (const segment of attr.split(";")) {
//       const s = segment.trim();
//       if (!s) continue;
  
//       const i = s.indexOf(":");        // only the first colon splits group vs list
//       if (i < 0) continue;
  
//       const group = s.slice(0, i).trim();
//       const rhs   = s.slice(i + 1).trim();   // may contain colons inside IQNs
//       if (!group || !rhs) continue;
  
//       const iqns = rhs.split(",").map(x => x.trim()).filter(Boolean);
//       if (iqns.length) out.set(group, iqns);
//     }
//     return out;
//   }
parseInitiatorGroups(attr?: string): Map<string, string[]> {
    const out = new Map<string, string[]>();
    if (!attr) return out;
  
    for (const segment of attr.split(";")) {
      const s = segment.trim();
      if (!s) continue;
  
      const i = s.indexOf(":");
      if (i < 0) continue;
  
      const group = s.slice(0, i).trim();
      const rhs   = s.slice(i + 1).trim();  // may be empty
      if (!group) continue;
  
      const iqns = rhs
        ? rhs.split(",").map(x => x.trim()).filter(Boolean)
        : [];
  
      out.set(group, Array.from(new Set(iqns)).sort()); // de-dupe + sort
    }
    return out;
  }  
    // getInitatorGroupsOfTarget(
    //     target: Pick<Target, "name" | "devicePath">
    //   ): ResultAsync<InitiatorGroup[], ProcessError> {
    //     const self = this;
      
    //     const toInitiators = (iqns: string[]): Initiator[] =>
    //       iqns.map(iqn => ({ name: iqn }));
      
    //     return this.findTargetPCSResource(target).andThen((resource) =>
    //       new ResultAsync(
    //         safeTry(async function* () {
    //           const attrs = yield* self.pcsResourceManager
    //             .fetchResourceInstanceAttributeValues(
    //               { name: resource.name },
    //               ["initiator_groups"]
    //             )
    //             .safeUnwrap();
      
    //           const igAttr = attrs.get("initiator_groups");
    //           const groupsMap = self.parseInitiatorGroups(igAttr);
      
    //           const names = groupsMap.size
    //             ? Array.from(groupsMap.keys())
    //             : ["allowed"]; // fallback
      
    //           const groups: InitiatorGroup[] = [];
    //           for (const name of names) {
    //             const iqns = groupsMap.get(name) ?? [];
    //             const group: InitiatorGroup = {
    //               name,
    //               devicePath: resource.name,
    //               logicalUnitNumbers: [],
    //               initiators: toInitiators(iqns),
    //             };
      
    //             // If your LUN lookup only needs the target resource to scope by RG,
    //             // passing just devicePath is fine. If you later need per-group LUN masking,
    //             // extend this call to accept group.name too.
    //             group.logicalUnitNumbers = yield* self
    //               .getLogicalUnitNumbersOfInitiatorGroup({ devicePath: group.devicePath })
    //               .safeUnwrap();
      
    //             groups.push(group);
    //           }
      
    //           return ok<InitiatorGroup[]>(groups);
    //         })
    //       )
    //     );
    //   }
    getInitatorGroupsOfTarget(
        target: Pick<Target, "name" | "devicePath">
      ): ResultAsync<InitiatorGroup[], ProcessError> {
        const self = this;
      
        const toInitiators = (iqns: string[]): Initiator[] =>
          iqns.map((iqn) => new Initiator(iqn)); // or { name: iqn }
      
        return this.findTargetPCSResource(target).andThen((resource) =>
          new ResultAsync(safeTry(async function* () {
            const attrs = yield* self.pcsResourceManager
              .fetchResourceInstanceAttributeValues({ name: resource.name }, ["initiator_groups"])
              .safeUnwrap();
      
            const groupsMap = self.parseInitiatorGroups(attrs.get("initiator_groups"));
            const groupNames = groupsMap.size
              ? Array.from(groupsMap.keys()).sort()
              : ["allowed"]; // fallback if attribute missing
      
            const groups: InitiatorGroup[] = [];
            for (const name of groupNames) {
              const iqns = groupsMap.get(name) ?? [];
              const group: InitiatorGroup = {
                name,
                devicePath: resource.name, // PCS resource id; if you prefer IQN, pass that consistently everywhere
                logicalUnitNumbers: [],
                initiators: toInitiators(iqns),
              };
      
              group.logicalUnitNumbers = yield* self
                .getLogicalUnitNumbersOfInitiatorGroup({ devicePath: group.devicePath })
                .safeUnwrap();
      
              groups.push(group);
            }
      
            return ok(groups);
          }))
        );
      }
      
    getCHAPConfigurationsOfTarget(target: Pick<Target, "name" | "devicePath">): ResultAsync<CHAPConfiguration[], ProcessError> {
        return this.findTargetPCSResource(target)
            .andThen((resource) => this.pcsResourceManager.fetchResourceInstanceAttributeValues(resource, ["incoming_username", "incoming_password"]))
            .map((value) => {
                if (value.get("incoming_username") !== undefined && value.get("incoming_password") !== undefined) {
                    return [new CHAPConfiguration(value.get("incoming_username")!, value.get("incoming_password")!, CHAPType.IncomingUser)]
                }

                return [];
            })
    }

    getLogicalUnitNumbersOfInitiatorGroup(initiatorGroup: Pick<InitiatorGroup, "devicePath">): ResultAsync<LogicalUnitNumber[], ProcessError> {
        return this.pcsResourceManager.fetchResourceByName(initiatorGroup.devicePath)
            .andThen((targetResource) => this.pcsResourceManager.fetchResources().map((resources) => resources.filter((resource) => resource.resourceType === PCSResourceType.LUN && resource.resourceGroup?.name === targetResource?.resourceGroup?.name)))
            .andThen((filteredResources) => {
                console.log("filteredResources", filteredResources);
                return ResultAsync.combine(filteredResources.map((resource) => this.pcsResourceManager.fetchResourceInstanceAttributeValues(resource, ["lun", "path"])
                    .andThen((values) => {
                        const lunAttribute = StringToIntCaster()(values.get("lun")!);
                        const virtualDevice = this.virtualDevices.find((device) => device.filePath === values.get("path"));
                        if (virtualDevice !== undefined)
                            console.log("found matching device for LUN", values, virtualDevice);
                            return okAsync(new LogicalUnitNumber(virtualDevice.deviceName, lunAttribute.some(), virtualDevice));
                        return okAsync(undefined);
                    })
                ))
                    .map((foundLuns) => foundLuns.filter((lun) => lun !== undefined)) as ResultAsync<LogicalUnitNumber[], ProcessError>;
            });
    }

    // getInitiatorsOfInitiatorGroup(initiatorGroup: Pick<InitiatorGroup, "name" | "devicePath">): ResultAsync<Initiator[], ProcessError> {
    //    console.log("getInitiatorsOfInitiatorGroup", initiatorGroup);
    //     return this.pcsResourceManager.fetchResourceByName(initiatorGroup.devicePath)
    //         .andThen((targetResource) => this.pcsResourceManager.fetchResourceInstanceAttributeValue(targetResource!, "initiator_groups"))
    //         .map((value) => {
    //             if (value !== undefined) {
    //                 return value.split(" ").map((initiatorName) => new Initiator(initiatorName))
    //             }

    //             return [];
    //         })
    // }

    getInitiatorsOfInitiatorGroup(
        initiatorGroup: Pick<InitiatorGroup, "name" | "devicePath">
      ): ResultAsync<Initiator[], ProcessError> {
        return this.pcsResourceManager
          .fetchResourceByName(initiatorGroup.devicePath) // if this is actually an IQN, switch to fetchResourceByAttr("iqn", initiatorGroup.devicePath, PCSResourceType.TARGET)
          .andThen((targetResource) => {
            if (!targetResource) {
              return errAsync(new ProcessError(
                `Target resource '${initiatorGroup.devicePath}' not found.`
              ));
            }
            return this.pcsResourceManager.fetchResourceInstanceAttributeValue(
              { name: targetResource.name },
              "initiator_groups"
            );
          })
          .map((raw) => {
            const map = this.parseInitiatorGroups(raw);
            const iqns = map.get(initiatorGroup.name.trim()) ?? [];
            // Choose one construction style and keep it everywhere:
            return iqns.map((iqn) => new Initiator(iqn));
            // or: return iqns.map((iqn) => ({ name: iqn }));
          });
      }
      
    
    getSessionsOfTarget(target: Pick<Target, "name">): ResultAsync<Session[], ProcessError> {
        return this.singleServerDriver!.getSessionsOfTarget(target);
    }

    getConnectionsOfSession(session: Session): ResultAsync<Connection[], ProcessError> {
        return this.singleServerDriver!.getConnectionsOfSession(session);
    }

    findTargetPCSResource(target: Pick<Target, "name" | "devicePath">) {
        const self = this;

        return this.pcsResourceManager.fetchResourceByName(target.devicePath)
            .andThen((resource) => {
                console.log("findTargetPCSResource", target, resource);
                return resource !== undefined ? okAsync(resource) : errAsync(new ProcessError(`Unable to find resource for Target IQN ${target.name}.`))
            });
    }

    findPortblockPCSResource(target: Target, portal: Portal, type: PCSResourceType.PORTBLOCK_ON | PCSResourceType.PORTBLOCK_OFF) {
        const self = this;

        const actionFromType = type === PCSResourceType.PORTBLOCK_ON ? "block" : "unblock";

        return this.findTargetPCSResource(target)
            .andThen((targetResource) => new ResultAsync(safeTry(async function* () {
                if (targetResource.resourceGroup != undefined) {
                    let resources = yield* self.pcsResourceManager.fetchResources().safeUnwrap();

                    for (var groupResource of resources.filter((resource) => resource.resourceGroup?.name === targetResource.resourceGroup?.name)) {
                        let attributes = yield* self.pcsResourceManager.fetchResourceInstanceAttributeValues({ name: groupResource.name }, ["action", "ip"]).safeUnwrap();
                        
                        if (attributes.get("action") === actionFromType && attributes.get("ip") === portal.address.split(":")[0]!) {
                            const resource = yield* self.pcsResourceManager.fetchResourceByName(groupResource.name).safeUnwrap();
                            return ok<PCSResource>(resource!);
                        }
                    }
                }

                return ok(undefined);
            })))
    }

    findPortblockVIPResource(target: Target, portal: Portal) {
        const self = this;

        return this.findTargetPCSResource(target)
            .andThen((targetResource) => new ResultAsync(safeTry(async function* () {
                if (targetResource.resourceGroup != undefined) {
                    let resources = yield* self.pcsResourceManager.fetchResources().safeUnwrap();

                    for (var groupResource of resources.filter((resource) => resource.resourceGroup?.name === targetResource.resourceGroup?.name)) {
                        const foundResource = yield* self.pcsResourceManager.fetchResourceByName(groupResource.name).safeUnwrap();

                        if (foundResource!.resourceType === PCSResourceType.VIP) {
                            const vipAddress = yield* self.pcsResourceManager.fetchResourceInstanceAttributeValue(foundResource!, "ip").safeUnwrap();

                            if (vipAddress === portal.address.split(":")[0]!) {
                                return ok<PCSResource>(foundResource!);
                            }
                        }
                    }
                }

                return ok(undefined);
            })))
    }

    createAndConfigureRBDResource(lun: LogicalUnitNumber, targetIQN: string, group: PCSResourceGroup) {
        const blockDevice = (lun.blockDevice! as RadosBlockDevice);
        const server = blockDevice.server;
        return server.execute(new BashCommand(`rbd unmap ${blockDevice.parentPool.name}/${blockDevice.deviceName}`))
            .andThen(() => this.pcsResourceManager.createResource(`RBD_${blockDevice.deviceName}`, `ocf:ceph:rbd name=${blockDevice.deviceName} pool=${blockDevice.parentPool.name} user=admin cephconf=/etc/ceph/ceph.conf op start timeout=60s interval=0 op stop timeout=60s interval=0 op monitor timeout=30s interval=15s`, PCSResourceType.RBD,server)
                .andThen((resource) => this.pcsResourceManager.constrainResourceToGroup(resource, group,server)
                    .andThen(() => this.pcsResourceManager.orderResourceBeforeGroup(resource, group)))
            )
            .andThen(() => this.pcsResourceManager.createResource(`${this.resourceNamePrefix}_LUN_${blockDevice.deviceName}`, `ocf:heartbeat:iSCSILogicalUnit target_iqn=${targetIQN} lun=${lun.unitNumber} path=${blockDevice.filePath} op start timeout=100 op stop timeout=100 op monitor interval=10 timeout=100`, PCSResourceType.LUN,server))
            .andThen((resource) => this.pcsResourceManager.addResourceToGroup(resource, group))
    }

    removeRBDAndRelatedResource(lun: LogicalUnitNumber, targetIQN: string) {
        const self = this;
        console.log("removeRBDAndRelatedResource", lun, targetIQN);
        const blockDevice = lun.blockDevice! as RadosBlockDevice;

        return new ResultAsync(safeTry(async function* () {
            yield* self.removeRBDResources([blockDevice]).safeUnwrap();
            yield* self.removeLUNResource(lun, targetIQN).safeUnwrap();

            return ok(undefined);
        }))
    }

     createAndConfigureLVResources(lun: LogicalUnitNumber, targetIQN: string, group: PCSResourceGroup) {
        const self = this;
       const server = lun.blockDevice?.server;
        const blockDevice = (lun.blockDevice! as LogicalVolume);
        // const blockDevice = lun.blockDevice ?? await self.resolveLogicalVolume(lun);
        if(!server){
            return errAsync(new ProcessError("Server is undefined for Logical Volume"));
        }
        return server.execute(new BashCommand(`lvchange -an ${blockDevice!.volumeGroup.name}/${blockDevice!.deviceName}`))
            .andThen(() => new ResultAsync(safeTry(async function* () {
                for (let physicalVolume of blockDevice.volumeGroup.volumes) {
                    yield* server.execute(new BashCommand(`rbd unmap ${physicalVolume.rbd.parentPool.name}/${physicalVolume.rbd.deviceName}`)).safeUnwrap();
                    
                    const resource = yield* self.pcsResourceManager.createResource(`RBD_${physicalVolume.rbd.deviceName}`, `ocf:ceph:rbd name=${physicalVolume.rbd.deviceName} pool=${physicalVolume.rbd.parentPool.name} user=admin cephconf=/etc/ceph/ceph.conf op start timeout=60s interval=0 op stop timeout=60s interval=0 op monitor timeout=30s interval=15s`, PCSResourceType.RBD,server).safeUnwrap();
                    yield* self.pcsResourceManager.constrainResourceToGroup(resource, group,server).safeUnwrap();
                    yield* self.pcsResourceManager.orderResourceBeforeGroup(resource, group).safeUnwrap();

                }

                return ok(undefined);
            })))
            .andThen(() => this.pcsResourceManager.createResource(`${this.resourceNamePrefix}_LVM_${blockDevice.deviceName}_${blockDevice.volumeGroup.name}`, `ocf:heartbeat:LVM-activate lvname=${blockDevice.deviceName} vgname=${blockDevice.volumeGroup.name} activation_mode=exclusive vg_access_mode=system_id op start timeout=30 op stop timeout=30 op monitor interval=10 timeout=60`, PCSResourceType.LVM,server))
            .andThen((resource) => this.pcsResourceManager.addResourceToGroup(resource, group))
            .andThen(() => this.pcsResourceManager.createResource(`${this.resourceNamePrefix}_LUN_${blockDevice.deviceName}`, `ocf:heartbeat:iSCSILogicalUnit target_iqn=${targetIQN} lun=${lun.unitNumber} path=${blockDevice.filePath} op start timeout=100 op stop timeout=100 op monitor interval=10 timeout=100`, PCSResourceType.LUN,server))
            .andThen((resource) => this.pcsResourceManager.addResourceToGroup(resource, group))
            .andThen(() => this.server.execute(new BashCommand(`pcs resource cleanup`)))
    }
    removeLVAndRelatedResources(lun: LogicalUnitNumber, targetIQN: string) {
        const self = this;

        const blockDevice = lun.blockDevice! as LogicalVolume;

        return new ResultAsync(safeTry(async function* () {
            let rbdsToRemove = blockDevice.volumeGroup.volumes.map((physicalVolume) => physicalVolume.rbd);
            console.log("removeLVAndRelatedResources", lun, targetIQN, rbdsToRemove);
            yield* self.removeLUNResource(lun, targetIQN).safeUnwrap();

            const lvmResources = yield* self.pcsResourceManager.fetchResources().safeUnwrap();

            for (var resource of lvmResources.filter((resource) => resource.resourceType === PCSResourceType.LVM)) {
                const values = yield* self.pcsResourceManager.fetchResourceInstanceAttributeValues(resource, ["lvname", "vgname"]).safeUnwrap();
                if (values.get("lvname") === blockDevice.deviceName && values.get("vgname") === blockDevice.volumeGroup.name) {
                    yield* self.pcsResourceManager.deleteResource(resource).safeUnwrap();
                    break;
                }
            }
            console.log("rbdsToRemove", rbdsToRemove);
            yield* self.removeRBDResources(rbdsToRemove).safeUnwrap();

            return ok(undefined);
        }))
    }

    removeRBDResources(rbdsToRemove: RadosBlockDevice[]) {
        const self = this;
        return new ResultAsync(safeTry(async function* () {
            const rbdResources = yield* self.pcsResourceManager.fetchResources().safeUnwrap();

            for (var resource of rbdResources.filter((resource) => resource.resourceType === PCSResourceType.RBD)) {
                const values = yield* self.pcsResourceManager.fetchResourceInstanceAttributeValues(resource, ["name", "pool"]).safeUnwrap();

                for (var rbdToRemove of rbdsToRemove) {
                    if (values.get("name") === rbdToRemove.deviceName && values.get("pool") === rbdToRemove.parentPool.name) {
                        yield* self.pcsResourceManager.disableResource(resource).safeUnwrap();
                        break;
                    }
                }
            }

            for (var resource of rbdResources.filter((resource) => resource.resourceType === PCSResourceType.RBD)) {
                const values = yield* self.pcsResourceManager.fetchResourceInstanceAttributeValues(resource, ["name", "pool"]).safeUnwrap();

                for (var rbdToRemove of rbdsToRemove) {
                    if (values.get("name") === rbdToRemove.deviceName && values.get("pool") === rbdToRemove.parentPool.name) {
                        yield* self.pcsResourceManager.deleteResource(resource).safeUnwrap();
                        break;
                    }
                }
            }

            return ok(undefined);
        }));
    }

    removeLUNResource(lun: LogicalUnitNumber, targetIQN: string) {
        const self = this;

        return new ResultAsync(safeTry(async function* () {
            const lunResources = yield* self.pcsResourceManager.fetchResources().safeUnwrap();

            for (var resource of lunResources.filter((resource) => resource.resourceType === PCSResourceType.LUN)) {
                const values = yield* self.pcsResourceManager.fetchResourceInstanceAttributeValues(resource, ["lun", "target_iqn"]).safeUnwrap();

                if (values.get("lun") === lun.unitNumber.toString() && values.get("target_iqn") === targetIQN) {
                    yield* self.pcsResourceManager.deleteResource(resource).safeUnwrap();
                    break;
                }
            }

            return ok(undefined);
        }));
    }
}






type LogicalVolumeInfoJson = {
    report: {
        lv: {
            lv_name: string,
            vg_name: string,
            lv_size: string,
            server: Server
        }[]
    }[]
}

type VolumeGroupInfoJson = {
    report: {
        pv: {
            pv_name: string,
            vg_name: string,
        }[]
    }[]
}