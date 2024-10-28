export class Pool {
    name: string;
    poolType: PoolType;

    constructor(name: string, poolType: PoolType) {
        this.name = name;
        this.poolType = poolType;
    }
}

export enum PoolType {
    Replication = "Replication",
    ErasureCoded = "Erasure Coded"
}