import { PCSResourceType } from '@/tabs/iSCSI/types/cluster/PCSResource';
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
import { PhysicalVolume } from '../cluster/PhysicalVolume';
import { VolumeGroup } from '../cluster/VolumeGroup';

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
            .map(() => undefined)
    }

    removeTarget(target: Target): ResultAsync<void, ProcessError> {
        const self = this;
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

    addInitiatorGroupToTarget(
        target: Target,
        initiatorGroup: InitiatorGroup
      ): ResultAsync<void, ProcessError> {
        const self = this;
      
        initiatorGroup.devicePath = target.devicePath;

        return this.pcsResourceManager.fetchResourceByName(initiatorGroup.devicePath)
            .andThen((resource) => {
                if (!resource) {
                    return errAsync(new ProcessError("Resource not found."));
                }
                return okAsync(resource);
            })
          .andThen((targetResource) => {
            if (!targetResource) {
              return errAsync(new ProcessError("Could not find Target resource."));
            }
      
            return self.pcsResourceManager
              .fetchResourceInstanceAttributeValues(
                { name: target.devicePath },      
                ["initiator_groups"]
              )
              .andThen((attributes) => {
                const existing = attributes.get("initiator_groups") ?? ""; // e.g. "TestA:iqn1;TestB:iqn2"
                const updatedInitiatorList = existing + ';' + initiatorGroup.name + ':';
                return self.pcsResourceManager
                  .updateResource(targetResource, `initiator_groups='${updatedInitiatorList}'`)
                  .map(() => undefined);
              });
          });
      }

      deleteInitiatorGroupFromTarget(
        _target: Target,
        group: InitiatorGroup
      ): ResultAsync<void, ProcessError> {
        const ensureLuns =
          Array.isArray(group.logicalUnitNumbers) && group.logicalUnitNumbers.length > 0
            ? okAsync(group.logicalUnitNumbers)
            : this.getLogicalUnitNumbersOfInitiatorGroup(group).map(luns => {
                group.logicalUnitNumbers = luns;
                return luns;
              });      
        return ensureLuns
          .andThen(luns =>
            ResultAsync
              .combine(luns.map(l => this.removeLogicalUnitNumberFromGroup(group, l).map(() => undefined)))
              .map(() => undefined)
          )
          .andThen(() =>
            this.pcsResourceManager.fetchResourceByName(group.devicePath).andThen(res => {
              if (!res) return errAsync(new ProcessError("Could not find Target resource."));
              return this.pcsResourceManager
                .fetchResourceInstanceAttributeValues({ name: res.name }, ["initiator_groups"])
                .andThen(attrs => {
                  const existing = attrs.get("initiator_groups") ?? "";
                  const map = this.parseInitiatorGroups(existing);
                  if (!map.has(group.name)) return okAsync(undefined);
                  map.delete(group.name);
                  const updated = this.serializeInitiatorGroups(map);
                  if (updated === existing) return okAsync(undefined);
                  return this.pcsResourceManager
                    .updateResource(res, `initiator_groups=${updated}`)
                    .map(() => undefined);
                });
            })
          );
      }
      
  
    addInitiatorToGroup(
    group: InitiatorGroup,
    newInitiator:  Initiator
  ): ResultAsync<void, ProcessError> {
    const self = this;
  
    // The PCS resource name lives in target.devicePath (e.g., "iscsi_TARGET_target1")
    return this.pcsResourceManager.fetchResourceByName(group.devicePath)
      .andThen((targetResource) => {
        if (!targetResource) {
          return errAsync(new ProcessError("Could not find Target resource."));
        }
  
        return self.pcsResourceManager
          .fetchResourceInstanceAttributeValues(
            { name: targetResource.name },
            ["initiator_groups"]
          )
          .andThen((attrs) => {
            const existing = attrs.get("initiator_groups") ?? "";
            const map = self.parseInitiatorGroups(existing);
  
            // merge (add group if it doesn't exist; dedupe IQNs)
            const current = new Set(map.get(group.name) ?? []);
            current.add(newInitiator.name);
            map.set(group.name, Array.from(current));
  
            const updated = self.serializeInitiatorGroups(map);
            return self.pcsResourceManager
              .updateResource(targetResource, `initiator_groups='${updated}'`)
              .map(() => undefined);
          });
      });
  }
  

  removeInitiatorFromGroup(
    group: InitiatorGroup,
    initiator: Initiator,
  ): ResultAsync<void, ProcessError> {
    const self = this;
  
    return this.pcsResourceManager.fetchResourceByName(group.devicePath)
      .andThen((targetResource) => {
        if (!targetResource) {
          return errAsync(new ProcessError("Could not find Target resource."));
        }
  
        return self.pcsResourceManager
          .fetchResourceInstanceAttributeValues(
            { name: targetResource.name },
            ["initiator_groups"]
          )
          .andThen((attrs) => {
            const existing = attrs.get("initiator_groups") ?? "";
            const map = self.parseInitiatorGroups(existing);
    
            // Remove IQN from the group (no-op if it isn't there)
            const cur = new Set(map.get(group.name) ?? []);
            const beforeSize = cur.size;
            cur.delete(initiator.name);
  
            const nextList = Array.from(cur);
              map.set(group.name, nextList);     // keep empty group as `Group:`
            
  
            const updated = self.serializeInitiatorGroups(map);
            if (updated === existing) {
              return okAsync<void>(undefined);
            }
            const param = `initiator_groups='${updated}'`;
            return self.pcsResourceManager
              .updateResource(targetResource, param)
              .map(() => undefined);
          });
      });
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
                                yield* self.createAndConfigureLVResources(logicalUnitNumber, targetIQN!, targetResource.resourceGroup!,initiatorGroup.name).safeUnwrap();
                            }
                            else{
                                const lvPath = logicalUnitNumber.blockDevice!.filePath;
                                const pathParts = lvPath.split("/");
                
                               if (pathParts.length < 4) {
                                 throw new Error(`Invalid block device path: ${lvPath}`);
                                }
       
                                const vgname = pathParts[2];
                                const lvname = pathParts[3];
                                const server = logicalUnitNumber.blockDevice?.server;
                               if (vgname && lvname && server) {
                                   const logicalVolume = yield* self.resolveLogicalVolume(vgname, lvname,server).safeUnwrap();
                                    logicalUnitNumber.blockDevice = logicalVolume;
                                    }
           
                            yield* self.createAndConfigureLVResources(logicalUnitNumber, targetIQN!, targetResource.resourceGroup!,initiatorGroup.name).safeUnwrap();
                            if (logicalUnitNumber.blockDevice?.server) {
                                logicalUnitNumber.blockDevice.server = self.rbdManager.allServers[0];
                            }
                        }
                        }
                       else  if (logicalUnitNumber.blockDevice! instanceof RadosBlockDevice) {

                            yield* self.createAndConfigureRBDResource(logicalUnitNumber, targetIQN!, targetResource.resourceGroup!,initiatorGroup.name).safeUnwrap();
                        }
                        const execServer =  self.rbdManager.allServers[0];
                        console.log(self.rbdManager.allServers[0])
                        return okAsync(execServer);
                    }))
                }

                return errAsync(new ProcessError("Could not find Target resource."))
            })
    }
    
    resolveLogicalVolume(vgname: string, lvname: string,server:Server): ResultAsync<LogicalVolume, Error> {
        const self = this;
        return server.execute(new BashCommand(`lvs --reportformat json --units B`))
            .map((proc) => proc.getStdout())
            .andThen(safeJsonParse<LogicalVolumeInfoJson>)
            .map((lvData) => {
                const lvs = lvData?.report?.flatMap((r) => r.lv) ?? [];
                const match = lvs.find((lv) => lv.lv_name === lvname && lv.vg_name === vgname);
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
                        
                        const physicalVolumes = pvList.flatMap((pv) =>
                            mappedBlockDevices.find((rbd) => rbd.filePath === pv.pv_name && rbd.server.host == server.host)
                        )
                        .filter((rbd): rbd is RadosBlockDevice => rbd !== undefined)
                        .map((rbd) => new PhysicalVolume(rbd));
                        
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
              return ok(undefined);
            }))
          )
          .andThen(() => {
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
   serializeInitiatorGroups(groups: Map<string, string[]>): string {
    // Keep stable alphabetical order; change to original order if you prefer.
    return Array.from(groups.keys())
      .sort()
      .map(g => `${g}:${(groups.get(g) ?? []).join(",")}`)
      .join(";");
  }
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
            const groupNames = Array.from(groupsMap.keys()).sort();
      
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
                .getLogicalUnitNumbersOfInitiatorGroup(group)
                .safeUnwrap();
              console.log("group.logicalUnitNumbers",group.logicalUnitNumbers);
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

    getLogicalUnitNumbersOfInitiatorGroup(
        initiatorGroup: InitiatorGroup
      ): ResultAsync<LogicalUnitNumber[], ProcessError> {   
       const target = initiatorGroup.devicePath.split("iscsi_TARGET_")[1];  
       console.log("hellor from getLogicalUnitNumbersOfInitiatorGroup",initiatorGroup,target);
        return this.pcsResourceManager.fetchResources()
          .map(resources => resources.filter(r =>
            r.resourceType === PCSResourceType.LUN
          ))
          .andThen(lunResources =>
            ResultAsync.combine(
              lunResources.map(res =>
                this.pcsResourceManager
                  .fetchResourceInstanceAttributeValues(res, ["group", "lun", "path","target_iqn"])
                  .map(attrs => ({ attrs }))
              )
            )
          )
          .map(items => items.filter(({ attrs }) =>
            (attrs.get("group") ?? "") === initiatorGroup.name &&
           (attrs.get("target_iqn") ?? "") === target
          
          ))
          .andThen(items =>
            ResultAsync.combine(
              items.map(({ attrs }) => {
                const lunStr  = attrs.get("lun")  ?? "";
                const pathRaw = attrs.get("path") ?? "";
                const parsed = StringToIntCaster()(lunStr);
                
                const dev = this.virtualDevices.find(d =>
                d.filePath === pathRaw
                );
      
                if (!dev) {
                  return okAsync<LogicalUnitNumber | undefined>(undefined);
                }

                return okAsync<LogicalUnitNumber | undefined>(
                  new LogicalUnitNumber(dev.deviceName, parsed.some(), dev)
                );
              })
            )
          )
         .map((list) => list.filter((lun) => lun !== undefined)) as ResultAsync<LogicalUnitNumber[], ProcessError>;
      }
                  

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
            return iqns.map((iqn) => new Initiator(iqn));
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

    createAndConfigureRBDResource(lun: LogicalUnitNumber, targetIQN: string, group: PCSResourceGroup,initiatorGroupName: string) {
        const blockDevice = (lun.blockDevice! as RadosBlockDevice);
        const server = blockDevice.server;
        return server.execute(new BashCommand(`rbd unmap ${blockDevice.parentPool.name}/${blockDevice.deviceName}`))
            .andThen(() => this.pcsResourceManager.createResource(`RBD_${blockDevice.deviceName}`, `ocf:ceph:rbd name=${blockDevice.deviceName} pool=${blockDevice.parentPool.name} user=admin cephconf=/etc/ceph/ceph.conf op start timeout=60s interval=0 op stop timeout=60s interval=0 op monitor timeout=30s interval=15s`, PCSResourceType.RBD,server)
                .andThen((resource) => this.pcsResourceManager.constrainResourceToGroup(resource, group,server)
                    .andThen(() => this.pcsResourceManager.orderResourceBeforeGroup(resource, group)))
            )
            .andThen(() => this.pcsResourceManager.createResource(`${this.resourceNamePrefix}_LUN_${blockDevice.deviceName}`, `ocf:heartbeat:iSCSILogicalUnit implementation=scst target_iqn=${targetIQN} path=${blockDevice.filePath} lun=${lun.unitNumber} group=${initiatorGroupName} op start timeout=100 op stop timeout=100 op monitor interval=10 timeout=100`, PCSResourceType.LUN,server))
            .andThen((resource) => this.pcsResourceManager.addResourceToGroup(resource, group))
    }

    removeRBDAndRelatedResource(lun: LogicalUnitNumber, targetIQN: string) {
        const self = this;
        const blockDevice = lun.blockDevice! as RadosBlockDevice;

        return new ResultAsync(safeTry(async function* () {
            yield* self.removeLUNResource(lun, targetIQN).safeUnwrap();
            yield* self.removeRBDResources([blockDevice]).safeUnwrap();


            return ok(undefined);
        }))
    }

     createAndConfigureLVResources(lun: LogicalUnitNumber, targetIQN: string, group: PCSResourceGroup,initiatorGroupName: string) {
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
            .andThen(() => this.pcsResourceManager.createResource(`${this.resourceNamePrefix}_LUN_${blockDevice.deviceName}`, `ocf:heartbeat:iSCSILogicalUnit target_iqn=${targetIQN}  path=${blockDevice.filePath} lun=${lun.unitNumber} group=${initiatorGroupName} op start timeout=100 op stop timeout=100 op monitor interval=10 timeout=100`, PCSResourceType.LUN,server))
            .andThen((resource) => this.pcsResourceManager.addResourceToGroup(resource, group))
            .andThen(() => this.server.execute(new BashCommand(`pcs resource cleanup`)))
    }
    removeLVAndRelatedResources(lun: LogicalUnitNumber, targetIQN: string) {
        const self = this;

        const blockDevice = lun.blockDevice! as LogicalVolume;

        return new ResultAsync(safeTry(async function* () {
            let rbdsToRemove = blockDevice.volumeGroup.volumes.map((physicalVolume) => physicalVolume.rbd);
            yield* self.removeLUNResource(lun, targetIQN).safeUnwrap();

            const lvmResources = yield* self.pcsResourceManager.fetchResources().safeUnwrap();

            for (var resource of lvmResources.filter((resource) => resource.resourceType === PCSResourceType.LVM)) {
                const values = yield* self.pcsResourceManager.fetchResourceInstanceAttributeValues(resource, ["lvname", "vgname"]).safeUnwrap();
                if (values.get("lvname") === blockDevice.deviceName && values.get("vgname") === blockDevice.volumeGroup.name) {
                    yield* self.pcsResourceManager.deleteResource(resource).safeUnwrap();
                    break;
                }
            }
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
               //         yield* self.pcsResourceManager.disableResource(resource).safeUnwrap();
                        yield* self.pcsResourceManager.deleteResource(resource).safeUnwrap();
                        break;
                    }
                }
            }

            // for (var resource of rbdResources.filter((resource) => resource.resourceType === PCSResourceType.RBD)) {
            //     const values = yield* self.pcsResourceManager.fetchResourceInstanceAttributeValues(resource, ["name", "pool"]).safeUnwrap();

            //     for (var rbdToRemove of rbdsToRemove) {
            //         if (values.get("name") === rbdToRemove.deviceName && values.get("pool") === rbdToRemove.parentPool.name) {
            //             yield* self.pcsResourceManager.deleteResource(resource).safeUnwrap();
            //             break;
            //         }
            //     }
            // }

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