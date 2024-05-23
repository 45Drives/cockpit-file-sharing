import type { CHAPConfiguration } from "./CHAPConfiguration";
import type { InitiatorGroup } from "./InitiatorGroup";
import type { Portal } from "./Portal";
import type { Session } from "./Session";

export class Target {
    name: string;
    chapConfigurations: CHAPConfiguration[];
    initiatorGroup: InitiatorGroup[];
    portals: Portal[];
    sessions: Session[];

    constructor(name: string, chapConfigurations: CHAPConfiguration[], initiatorGroup: InitiatorGroup[], portals: Portal[], sessions: Session[]) {
        this.name = name;
        this.chapConfigurations = chapConfigurations;
        this.initiatorGroup = initiatorGroup;
        this.portals = portals;
        this.sessions = sessions;
    }
}