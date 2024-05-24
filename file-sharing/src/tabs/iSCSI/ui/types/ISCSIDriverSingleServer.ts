import { VirtualDevice, DeviceType } from "./VirtualDevice";
import { CHAPConfiguration } from "./CHAPConfiguration";
import { Connection } from "./Connection";
import { Initiator } from "./Initiator";
import { InitiatorGroup } from "./InitiatorGroup";
import { LogicalUnitNumber } from "./LogicalUnitNumber";
import { Portal } from "./Portal";
import { Session } from "./Session";
import { Target } from "./Target";
import { ISCSIDriver } from "./ISCSIDriver";
import { BashCommand, Command, ExitedProcess, ParsingError, ProcessError, Server, StringToIntCaster } from "@45drives/houston-common-lib";
import { ResultAsync, err, ok } from "neverthrow";

export class ISCSIDriverSingleServer implements ISCSIDriver {

    server: Server;

    deviceTypeToHandlerFolder = {
        [DeviceType.BlockIO]: "/sys/kernel/scst_tgt/handlers/vdisk_blockio",
        [DeviceType.FileIO]: "/sys/kernel/scst_tgt/handlers/vdisk_fileio"
    };

    targetFolder = "/sys/kernel/scst_tgt/targets/iscsi";

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
        return this.server.execute(new BashCommand(`echo "add_target $1" > $2`, [target.name, this.targetFolder + "/mgmt"]));
    }

    removeTarget(target: Target): ResultAsync<ExitedProcess, ProcessError> {
        return this.server.execute(new BashCommand(`echo "del_target $1" > $2`, [target.name, this.targetFolder + "/mgmt"]));
    }

    addPortalToTarget(target: Target, portal: Portal): void {
        throw new Error("Method not implemented.");
    }

    deletePortalFromTarget(target: Target, portal: Portal): void {
        throw new Error("Method not implemented.");
    }

    addInitiatorGroupToTarget(target: Target, initiatorGroup: InitiatorGroup): void {
        throw new Error("Method not implemented.");
    }

    deleteInitiatorGroupFromTarget(target: Target, initiatorGroup: InitiatorGroup): void {
        throw new Error("Method not implemented.");
    }

    addInitiatorToGroup(initiatorGroup: InitiatorGroup, initiator: Initiator): void {
        throw new Error("Method not implemented.");
    }

    removeInitiatorFromGroup(initiatorGroup: InitiatorGroup, initiator: Initiator): void {
        throw new Error("Method not implemented.");
    }

    addLogicalUnitNumberToGroup(logicalUnitNumber: LogicalUnitNumber, initiatorGroup: InitiatorGroup): void {
        throw new Error("Method not implemented.");
    }

    removeLogicalUnitNumberFromGroup(logicalUnitNumber: LogicalUnitNumber, initiatorGroup: InitiatorGroup): void {
        throw new Error("Method not implemented.");
    }

    addCHAPConfigurationToTarget(chapConfiguration: CHAPConfiguration, target: Target): void {
        throw new Error("Method not implemented.");
    }

    removeCHAPConfigurationToTarget(chapConfiguration: CHAPConfiguration, target: Target): void {
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

                return ResultAsync.combine([blockSizeResult, filePathResult]).map((([blockSize, filePath]) => {
                    return new VirtualDevice(virtualDeviceName, filePath, blockSize, deviceType);
                }));
            }));
        })
    }

    getTargets(): ResultAsync<Target[], ProcessError> {
        const targetDirectory = "/sys/kernel/scst_tgt/targets/iscsi";

        const result = this.server.execute(new Command(["find", targetDirectory, ..."-mindepth 1 -maxdepth 1 ( -type d -o -type l ) -printf %f\\0".split(" ")])).map(
            (proc) => {
                const targetNames = proc.getStdout().split("\0").slice(0, -1);
                return targetNames;
            }
        ).map((targetNames) => {
            return targetNames.map((targetName) => new Target(targetName))
        });

        return result;
    }

    getPortalsOfTarget(target: Target): Portal[] {
        throw new Error("Method not implemented.");
    }

    getInitatorGroupsOfTarget(target: Target): InitiatorGroup[] {
        throw new Error("Method not implemented.");
    }

    getSessionsOfTarget(target: Target): Session[] {
        throw new Error("Method not implemented.");
    }

    getCHAPConfigurationsOfTarget(target: Target): CHAPConfiguration[] {
        throw new Error("Method not implemented.");
    }

    getConnectionsOfSession(session: Session): Connection[] {
        throw new Error("Method not implemented.");
    }
    
    getLogicalUnitNumbersOfInitiatorGroup(initiatorGroup: InitiatorGroup): LogicalUnitNumber[] {
        throw new Error("Method not implemented.");
    }

    getInitiatorsOfInitiatorGroup(initiatorGroup: InitiatorGroup): InitiatorGroup[] {
        throw new Error("Method not implemented.");
    }
}