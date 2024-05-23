export class Connection {
    connectionID: string;
    ipAddress: string;

    constructor(connectionID: string, ipAddress: string) {
        this.connectionID = connectionID;
        this.ipAddress = ipAddress;
    }
}