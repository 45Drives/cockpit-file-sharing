export class CHAPConfiguration {
    username: string;
    password: string;
    chapType: CHAPType;

    constructor(username: string, password: string, chapType: CHAPType) {
        this.username = username;
        this.password = password;
        this.chapType = chapType;
    }
}

export namespace CHAPConfiguration {
    export function empty() : CHAPConfiguration {
        return {
            username: "",
            password: "",
            chapType: CHAPType.IncomingUser,
        }
    }
}

export enum CHAPType {
    IncomingUser = "IncomingUser",
    OutgoingUser = "OutgoingUser"
}