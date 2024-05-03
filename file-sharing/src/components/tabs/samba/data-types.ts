import { Path, User, Group } from "@45drives/houston-common-lib";

export class AdvancedOption {
    key: string;
    value: string;

    constructor(key: string, value: string) {
        this.key = key;
        this.value = value;
    }

    static parseString()
}

export interface ISambaShare {
    name: string;
    description: string;
    path: Path
    validUsers: (User | Group)[];
    guestOk: boolean;
    readOnly: boolean;
    browseable: boolean;

}
