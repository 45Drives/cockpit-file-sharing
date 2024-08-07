export interface Pool {
    name: string;
    poolType: PoolType;
}

export enum PoolType {
    Replication = "Replication",
    ErasureCoded = "Erasure Coded"
}