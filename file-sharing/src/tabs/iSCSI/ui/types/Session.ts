import type { Connection } from "./Connection";

export class Session {
    initiatorName: string;
    connections: Connection[];

    constructor(initiatorName: string, connections: Connection[]) {
        this.initiatorName = initiatorName;
        this.connections = connections;
    }
}