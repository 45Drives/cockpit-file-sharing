export type S3BucketTagMap = Record<string, string>;
export type S3Bucket = {
    name: string;
    region?: string;
    owner?: string;
    createdAt?: string;
  
    sizeBytes?: number;
    objectCount?: number;
    quotaBytes?: number;
  
    versioning?: BucketVersioningStatus;
    versionCount?: number;      // total object versions (Ceph)
    lastAccessed?: string;      // optional, if you ever fill it
  
    acl?: BucketAcl;
    policy?: string;
    tags?: S3BucketTagMap;
  
    garageId?: string;
    placementTarget?: string;
    zone?: string;
    zonegroup?: string
  };

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
  
  export interface CephBucketCreateOptions {
    ownerUid?: string;
  
    region?: string;
    placementTarget?: string;   
  
    objectLockEnabled?: boolean;
    objectLockMode?: "GOVERNANCE" | "COMPLIANCE";
    objectLockRetentionDays?: number;
  
    encryptionMode?: "none" | "sse-s3" | "kms";
    kmsKeyId?: string;
  
    bucketPolicyJson?: string;
    acl?: BucketAcl;
  }
  
  export type RgwGateway = {
    id: string;        
    hostname: string;    
    zonegroup: string;   
    zone: string;       
    endpoint: string;    
    isDefault: boolean;
  };


export type RgwUser = {
    uid: string;
    displayName?: string;
}  // cephRgwCliAdapter.ts

export type RgwDashboardS3Creds = {
    accessKey: string;
    secretKey: string;
  };