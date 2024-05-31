import type { Connection } from "./Connection";

export interface Session {
    initiatorName: string;
    connections: Connection[];

    devicePath: string;
}