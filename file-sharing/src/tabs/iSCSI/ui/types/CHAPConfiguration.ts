export interface CHAPConfiguration {
    username: string;
    password: string;
    chapType: CHAPType;
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