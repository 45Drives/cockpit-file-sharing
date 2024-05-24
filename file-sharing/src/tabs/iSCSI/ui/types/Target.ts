import { CHAPConfiguration } from "./CHAPConfiguration";
import type { InitiatorGroup } from "./InitiatorGroup";
import type { Portal } from "./Portal";
import type { Session } from "./Session";

export class Target {
    name: string;
    chapConfigurations: CHAPConfiguration[];
    initiatorGroup: InitiatorGroup[];
    portals: Portal[];
    sessions: Session[];

    constructor(name: string) {
        this.name = name;
        this.chapConfigurations = [];
        this.initiatorGroup = [];
        this.portals = [];
        this.sessions = [];
    }
}