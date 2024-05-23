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

export enum CHAPType {
    IncomingUser,
    OutgoingUser
}