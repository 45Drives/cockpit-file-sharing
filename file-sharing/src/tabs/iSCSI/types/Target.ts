import { CHAPConfiguration } from "./CHAPConfiguration";
import type { InitiatorGroup } from "./InitiatorGroup";
import type { Portal } from "./Portal";
import type { Session } from "./Session";

export interface Target {
    name: string;
    chapConfigurations: CHAPConfiguration[];
    initiatorGroups: InitiatorGroup[];
    portals: Portal[];
    sessions: Session[];
}

export namespace Target {
    export function empty() : Target {
        return {
            name: "",
            chapConfigurations: [],
            portals: [],
            sessions: [],
            initiatorGroups: [],
        }
    }
}