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
    tenant?: string ;
    fullName?: string | null;  // Full name / display name
    email?: string | null;
    suspended?: boolean;
    maxBuckets?: number | null;
    capacityLimitPercent?: number | null;
    objectLimitPercent?: number | null;
}  
export type RgwDashboardS3Creds = {
    accessKey: string;
    secretKey: string;
  };

  export type CreateRgwUserOptions = {
    uid: string;
    tenant?: string;
    displayName: string;
    email?: string;
    maxBuckets?: number;
  
    suspended?: boolean;
    systemUser?: boolean;
  
    autoGenerateKey?: boolean;
    accessKey?: string;
    secretKey?: string;
  
    // User quota
    userQuotaEnabled?: boolean;
    userQuotaMaxSizeKb?: number;    // already converted to KB
    userQuotaMaxObjects?: number;
  
    // Bucket quota defaults
    bucketQuotaEnabled?: boolean;
    bucketQuotaMaxSizeKb?: number;
    bucketQuotaMaxObjects?: number;
  }
  export type CreatedRgwUserKeys = {
    accessKey?: string;
    secretKey?: string;
  }

  export interface RgwUserKey {
    accessKey: string;
    secretKey?: string;
    user?: string;
  }
  
  export interface RgwUserCap {
    type: string;
    perm: string;
  }
  
  export interface RgwUserDetails extends RgwUser {
    keys?: RgwUserKey[];
    caps?: RgwUserCap[];
    raw?: any; 
  }

  export interface MinioUser {
    username: string;
    status: "enabled" | "disabled";
    policies?: string[];
    policyCount?: number;
    createDate?: string;
  }
  
  export interface MinioUserCreatePayload {
    username: string;
    secretKey: string;
    status: "enabled" | "disabled";
    policies: string[];
  }
  
  export interface MinioUserGroupMembership {
    name: string;
    policies?: string[];
  }
  export interface MinioUserDetails extends MinioUser {
    accessKey?: string;
    authentication?: string;
    memberOf?: MinioUserGroupMembership[];
    raw?: any; // keep raw for debugging / future use
  }

  export interface MinioUserUpdatePayload {
    username: string;
    status?: "enabled" | "disabled";
    policies?: string[];
    resetSecret?: boolean;
    newSecretKey?: string;
    groups: string[];
  }
  
  export interface MinioGroupInfo {
    name: string;
    members: string[];
    policies: string[];
    raw?: any;
  }