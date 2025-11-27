export type S3BucketTagMap = Record<string, string>;
export type S3Bucket = { 
    name : string
    region?: string
    owner?: string
    createdAt?: string
    sizeBytes?: number
    objectCount?:number
    quotaBytes?:number
    versioning?: BucketVersioningStatus
    acl?: BucketAcl
    policy?: string
    tags?: S3BucketTagMap
    garageId?: string
}

export type BucketAclPermission =
  | "FULL_CONTROL"
  | "READ"
  | "WRITE"
  | "READ_ACP"
  | "WRITE_ACP";

export type BucketAclGrant = {
  grantee: string;
  permission: BucketAclPermission | string; // keep string for safety if unsure
};

export type BucketAcl = {
  owner: string;
  grants: BucketAclGrant[];
};

export type BucketVersioningStatus = "Enabled" | "Suspended" | "Disabled";


export type EndpointType = "ceph-rgw" | "minio" | "garagehq" | "aws";

export interface Endpoint {
    id: string;
    name: string;
    type: "ceph-rgw";
    region?: string;
    useSSL: boolean;
}

export interface GarageBucketCreateOptions {
    placement?: string;
    quota?: string;           // already used for set-quotas
    allow?: string[];
    deny?: string[];
    extraArgs?: string[];
  
    website?: {
      enable: boolean;
      indexDocument?: string;
      errorDocument?: string;
    };
    aliases?: string[];
  }
  