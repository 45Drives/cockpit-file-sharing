export class Initiator {
    name: string;

    constructor(name: string) {
        this.name = name;
    }
}

export namespace Initiator {
    export function empty() : Initiator {
        return {
            name: "",
        }
    }
}