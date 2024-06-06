import type { Connection } from "./Connection";

export interface Session {
    initiatorName: string;
    connections: Connection[];

    writeAmountKB: number;
    readAmountKB: number;

    devicePath: string;
}