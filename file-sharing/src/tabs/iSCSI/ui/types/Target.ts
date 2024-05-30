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

    devicePath: string;
}

export namespace Target {
    export function empty() : Target {
        return {
            name: "",
            devicePath: "",
            chapConfigurations: [],
            portals: [],
            sessions: [],
            initiatorGroups: [],
        }
    }
}