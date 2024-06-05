export interface Initiator {
    name: string;
}

export namespace Initiator {
    export function empty() : Initiator {
        return {
            name: "",
        }
    }
}