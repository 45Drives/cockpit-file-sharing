import { File } from "@45drives/houston-common-lib";
import { VirtualDevice, DeviceType } from "./VirtualDevice";
import { CHAPConfiguration } from "./CHAPConfiguration";
import { Connection } from "./Connection";
import { Initiator } from "./Initiator";
import { type InitiatorGroup } from "./InitiatorGroup";
import { LogicalUnitNumber } from "./LogicalUnitNumber";
import { Portal } from "./Portal";
import { Session } from "./Session";
import { type Target } from "./Target";
import { ISCSIDriver } from "./ISCSIDriver";
import { BashCommand, Command, ExitedProcess, ParsingError, ProcessError, Server, StringToIntCaster, getServer } from "@45drives/houston-common-lib";
import { ResultAsync, err, ok, safeTry } from "neverthrow";

export class ISCSIDriverSingleServer implements ISCSIDriver {

    server: Server;

    deviceTypeToHandlerFolder = {
        [DeviceType.BlockIO]: "/sys/kernel/scst_tgt/handlers/vdisk_blockio",
        [DeviceType.FileIO]: "/sys/kernel/scst_tgt/handlers/vdisk_fileio"
    };

    targetManagementFolder = "/sys/kernel/scst_tgt/targets/iscsi";

    constructor(server: Server) {
        this.server = server;
    }

    addVirtualDevice(virtualDevice: VirtualDevice): ResultAsync<ExitedProcess, ProcessError> {
        return this.server.execute(new BashCommand(`echo "add_device $1 $2" > $3`, [virtualDevice.deviceName, "filename=" + virtualDevice.filePath + ";blocksize=" + virtualDevice.blockSize, this.deviceTypeToHandlerFolder[virtualDevice.deviceType] + "/mgmt"]));
    }

    removeVirtualDevice(virtualDevice: VirtualDevice): ResultAsync<ExitedProcess, ProcessError> {
        return this.server.execute(new BashCommand(`echo "del_device $1" > $2`, [virtualDevice.deviceName, this.deviceTypeToHandlerFolder[virtualDevice.deviceType] + "/mgmt"]));
    }

    createTarget(target: Target): ResultAsync<ExitedProcess, ProcessError> {
        return this.server.execute(new BashCommand(`echo "add_target $1" > $2`, [target.name, this.targetManagementFolder + "/mgmt"]));
    }

    removeTarget(target: Target): ResultAsync<ExitedProcess, ProcessError> {
        return this.server.execute(new BashCommand(`echo "del_target $1" > $2`, [target.name, this.targetManagementFolder + "/mgmt"]));
    }

    addPortalToTarget(target: Target, portal: Portal): ResultAsync<ExitedProcess, ProcessError> {
        return this.server.execute(new BashCommand(`echo "add_target_attribute $1 $2" > $3`, [target.name, `allowed_portal=${portal.address}`, `${target.devicePath}/../mgmt`]));
    }

    deletePortalFromTarget(target: Target, portal: Portal): ResultAsync<ExitedProcess, ProcessError> {
        return this.server.execute(new BashCommand(`echo "del_target_attribute $1 $2" > $3`, [target.name, `allowed_portal=${portal.address}`, `${target.devicePath}/../mgmt`]));
    }

    addInitiatorGroupToTarget(target: Target, initiatorGroup: InitiatorGroup): ResultAsync<ExitedProcess, ProcessError> {
        return this.server.execute(new BashCommand(`echo "create $1" > $2`, [initiatorGroup.name, `${target.devicePath}/ini_groups/mgmt`]));
    }

    deleteInitiatorGroupFromTarget(initiatorGroup: InitiatorGroup): ResultAsync<ExitedProcess, ProcessError> {
        return this.server.execute(new BashCommand(`echo "del $1" > $2`, [initiatorGroup.name, `${initiatorGroup.devicePath}/../mgmt`]));
    }

    addInitiatorToGroup(initiatorGroup: InitiatorGroup, initiator: Initiator): ResultAsync<ExitedProcess, ProcessError> {
        throw new Error("Method not implemented.");
    }

    removeInitiatorFromGroup(initiatorGroup: InitiatorGroup, initiator: Initiator): ResultAsync<ExitedProcess, ProcessError> {
        throw new Error("Method not implemented.");
    }

    addLogicalUnitNumberToGroup(logicalUnitNumber: LogicalUnitNumber, initiatorGroup: InitiatorGroup): ResultAsync<ExitedProcess, ProcessError> {
        throw new Error("Method not implemented.");
    }

    removeLogicalUnitNumberFromGroup(logicalUnitNumber: LogicalUnitNumber, initiatorGroup: InitiatorGroup): ResultAsync<ExitedProcess, ProcessError> {
        throw new Error("Method not implemented.");
    }

    addCHAPConfigurationToTarget(chapConfiguration: CHAPConfiguration, target: Target): ResultAsync<ExitedProcess, ProcessError> {
        throw new Error("Method not implemented.");
    }

    removeCHAPConfigurationToTarget(chapConfiguration: CHAPConfiguration, target: Target): ResultAsync<ExitedProcess, ProcessError> {
        throw new Error("Method not implemented.");
    }

    getVirtualDevices(): ResultAsync<VirtualDevice[], ProcessError> {

        const deviceTypesToCheck = [DeviceType.BlockIO, DeviceType.FileIO];

        const results = deviceTypesToCheck.map((deviceType) => this.getVirtualDevicesOfDeviceType(deviceType));

        return ResultAsync.combine(results).map((devices) => devices.flat());
    }

    getVirtualDevicesOfDeviceType(deviceType: DeviceType): ResultAsync<VirtualDevice[], ProcessError> { 
        return this.server.execute(new Command(["find", this.deviceTypeToHandlerFolder[deviceType], ..."-mindepth 1 -maxdepth 1 ( -type d -o -type l ) -printf %f\\0".split(" ")])).map(
            (proc) => {
                const virtualDeviceNames = proc.getStdout().split("\0").slice(0, -1);
                return virtualDeviceNames;
            }
        ).andThen((virtualDeviceNames) => {
            return ResultAsync.combine(virtualDeviceNames.map((virtualDeviceName) => {
                const virtualDevicePath = this.deviceTypeToHandlerFolder[deviceType] + "/" + virtualDeviceName;

                const blockSizeResult =  this.server.execute(new Command(["cat", virtualDevicePath + "/blocksize"])).andThen((proc) => {
                    const blockSizeString = proc.getStdout().trim();
                    const maybeBlockSize = StringToIntCaster()(blockSizeString);

                    if (maybeBlockSize.isNone())
                        return err(new ParsingError(`Failed to parse block size: ${blockSizeString}`))
    
                    return ok(maybeBlockSize.some());
                }); 
                
                const filePathResult =  this.server.execute(new Command(["cat", virtualDevicePath + "/filename"])).andThen((proc) => {
                    const filePathString = proc.getStdout().split('\n')[0];
    
                    if (filePathString === undefined)
                        return err(new ParsingError(`Failed to read file path: ${proc.getStdout()}`));

                    return ok(filePathString);
                });  

                return ResultAsync.combine([blockSizeResult, filePathResult]).map(([blockSize, filePath]) => {
                    return new VirtualDevice(virtualDeviceName, filePath, blockSize, deviceType);
                });
            }));
        })
    }

    getTargets(): ResultAsync<Target[], ProcessError> {
        const self = this;
        
        const targetDirectory = "/sys/kernel/scst_tgt/targets/iscsi";


        return this.server.execute(new Command(["find", targetDirectory, ..."-mindepth 1 -maxdepth 1 ( -type d -o -type l ) -printf %f\\0".split(" ")])).map(
            (proc) => {
                const targetNames = proc.getStdout().split("\0").slice(0, -1);
                return targetNames;
            }
        ).andThen((targetNames) => {
            return ResultAsync.combine(targetNames.map((targetName) => {
                return new ResultAsync(safeTry(async function * () {
                    const partialTarget = {
                        name: targetName,  
                        devicePath: targetDirectory + "/" + targetName,
                    };

                    return ok<Target>({
                        ...partialTarget,
                        portals: yield * self.getPortalsOfTarget(partialTarget).safeUnwrap(),
                        chapConfigurations: [],//yield * self.getCHAPConfigurationsOfTarget(partialTarget).safeUnwrap(),
                        initiatorGroups: yield * self.getInitatorGroupsOfTarget(partialTarget).safeUnwrap(),
                        sessions: [],//yield * self.getSessionsOfTarget(partialTarget).safeUnwrap()
                    });
                }))
            }))
        });
    }

    getPortalsOfTarget(target: Pick<Target, "name">): ResultAsync<Portal[], ProcessError> {
        const targetFolder = this.targetManagementFolder + "/" + target.name;

        return this.server.execute(new Command(["find", targetFolder, ..."-name allowed_portal* -printf %f\\0".split(" ")])).map(
            (proc) => {
                const portalAddressFileNames = proc.getStdout().split("\0").slice(0, -1);
                return portalAddressFileNames;
            }
        ).andThen((portalAddressFileNames) => {
            const addressResults = portalAddressFileNames.map((portalAddressFileName) => {
                return getServer().andThen((server) => {
                    const file = new File(server, targetFolder + "/" + portalAddressFileName)
                    return file.read().andThen((fileContent) => {
                        const address = fileContent.split('\n')[0]

                        if (address === undefined)
                            return err(new ProcessError(`Could not parse address from allowed_portal file: ${file.basename}`));

                        return ok(address);
                    });
                });
            })

            return ResultAsync.combine(addressResults).map((addresses) => addresses.map((address) => new Portal(address)));
        })
    }

    getInitatorGroupsOfTarget(target: Pick<Target, "name"> ): ResultAsync<InitiatorGroup[], ProcessError> {
        const self = this;

        const initiatorGroupFolder = `${this.targetManagementFolder}/${target.name}/ini_groups`;

        return this.server.execute(new Command(["find", initiatorGroupFolder, ..."-mindepth 1 -maxdepth 1 ( -type d -o -type l ) -printf %f\\0".split(" ")])).map(
            (proc) => {
                const groupNames = proc.getStdout().split("\0").slice(0, -1);
                return groupNames;
            }
        ).andThen((groupNames) => {
            return ResultAsync.combine(groupNames.map((groupName) => {
                
                return new ResultAsync(safeTry(async function * () {
                    const partialInitiatorGroup = {
                        name: groupName,
                        devicePath: `${initiatorGroupFolder}/${groupName}`,
                    };

                    return ok<InitiatorGroup>({
                        ...partialInitiatorGroup,
                        initiators: [],//yield * self.getInitiatorsOfInitiatorGroup(partialInitiatorGroup).safeUnwrap(),
                        logicalUnitNumbers: [],//yield * self.getLogicalUnitNumbersOfInitiatorGroup(partialInitiatorGroup).safeUnwrap(),
                    });
                }))
            }))
        });
    }

    getSessionsOfTarget(target: Target): ResultAsync<Session[], ProcessError> {
        throw new Error("Method not implemented.");
    }

    getCHAPConfigurationsOfTarget(target: Target): ResultAsync<CHAPConfiguration[], ProcessError> {
        throw new Error("Method not implemented.");
    }

    getConnectionsOfSession(session: Session): ResultAsync<Connection[], ProcessError> {
        throw new Error("Method not implemented.");
    }
    
    getLogicalUnitNumbersOfInitiatorGroup(initiatorGroup: Pick<InitiatorGroup, "name">): ResultAsync<LogicalUnitNumber[], ProcessError> {
        throw new Error("Method not implemented.");
    }

    getInitiatorsOfInitiatorGroup(initiatorGroup: Pick<InitiatorGroup, "name">): ResultAsync<Initiator[], ProcessError> {
        throw new Error("Method not implemented.");
    }
}