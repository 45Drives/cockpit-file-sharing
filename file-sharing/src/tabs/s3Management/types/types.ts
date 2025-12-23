export type S3BucketTagMap = Record<string, string>;
export interface S3BucketBase {
  backendKind: BackendKind;
  name: string;
  region?: string;
  owner?: string;
  createdAt?: string;

  sizeBytes?: number;
  objectCount?: number;
  quotaBytes?: number;

  objectLockEnabled?: boolean;
  versioning?: BucketVersioningStatus;
  versionCount?: number;

  lastAccessed?: string;
  lastModifiedTime?: string;

  // policy/tags (not all backends support equally)
  policy?: string;
  tags?: S3BucketTagMap;
}
export type BackendKind = "minio" | "ceph" | "garage"; 


export interface CephBucket extends S3BucketBase {
  backendKind: "ceph";
  acl?: CephAclRule[];
  placementTarget?: string;
  zone?: string;
  zonegroup?: string;
  adminRef: string
}

export interface GarageBucket extends S3BucketBase {
  backendKind: "garage";
  garageId?: string;

  garageMaxObjects?: number;
  garageWebsiteEnabled?: boolean;
  garageWebsiteIndex?: string;
  garageWebsiteError?: string;
  garageAliases?: string[];
}

export interface MinioBucket extends S3BucketBase {
  backendKind: "minio";
  // add MinIO-only fields later if/when needed
}

export type S3Bucket = CephBucket | GarageBucket | MinioBucket;

export type BucketByKind<K extends BackendKind> = Extract<S3Bucket, { backendKind: K }>;

export type BucketAclPermission =| "FULL_CONTROL"| "READ"| "WRITE"| "READ_ACP"| "WRITE_ACP";

export type BucketAclGrant = {
  grantee: string;
  permission: BucketAclPermission | string; // keep string for safety if unsure
};

export type BucketVersioningStatus = "Enabled" | "Suspended" | "Disabled";

export interface GarageBucketOptions {
    quota?: string | null;           
    allow?: string[] | null; 
    deny?: string[] | null;
    extraArgs?: string[] | null;
    maxObjects?: number | null;
    website?: {
      enable: boolean;
      indexDocument?: string;
      errorDocument?: string;
    } | null;
    aliases?: string[] | null;
    garageAliasesRemove?: string[] | null

  }
  
  export interface CephBucketCreateOptions {

    name: string;  
    tagsText?: string
    ownerUid?: string;
    region?: string;
    placementTarget?: string;   
    objectLockEnabled?: boolean;
    objectLockMode?: "GOVERNANCE" | "COMPLIANCE";
    objectLockRetentionDays?: number;
    encryptionMode?: "none" | "sse-s3" | "kms";
    kmsKeyId?: string;
    bucketPolicy?: string | null;
    aclRules?: CephAclRule[];
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
    quotaMaxSizeKb?: number | null;
    quotaMaxObjects?: number | null;
    quotaUsedSizeKb?: number | null;
    quotaUsedObjects?: number | null;
  
    quotaRemainingSizeKb?: number | null;
    quotaRemainingObjects?: number | null;
    quotaUsedSizePercent?: number | null;
    quotaUsedObjectsPercent?: number | null;

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
    bucketQuotaMaxSizeKb?: number | null;
    bucketQuotaMaxObjects?: number | null;
  
    keys: RgwUserKey[];
    caps: RgwUserCap[];
  }
  

  export interface MinioUser {
    username: string;
    status: "enabled" | "disabled";
    policies?: string[];
    policyCount?: number;
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

  export interface GarageKeyListEntry {
    id: string;
    created: string;
    name: string;
    expiration: string;
  }
  
  export interface GarageKeyDetail {
    id: string;
    name: string;
    created: string;
    expiration: string;
    validity?: string;
    canCreateBuckets?: boolean;
    secretKey?: string;
  }
  

  export interface MinioBucketUpdateOptions {
    versioning?: boolean;
    quotaSize?: string | null;
    tags?: Record<string, string> | null;
    objectLock?: boolean
  }
  
  export interface CephBucketUpdatePayload {
    cephAclRules: CephAclRule[] | undefined;
    name: string;          
    region?: string;
    owner?: string;       
    tagsText?: string;     
    cephVersioningEnabled?: boolean;
    cephEncryptionMode?: "none" | "sse-s3" | "kms";
    cephKmsKeyId?: string;

    bucketPolicy?: string | null;
  
    cephObjectLockMode?: "GOVERNANCE" | "COMPLIANCE";
    cephObjectLockRetentionDays?: string;
  
    cephAclGrantee?: string;
    cephAclPermission?:
      | "READ"
      | "WRITE"
      | "READ_ACP"
      | "WRITE_ACP"
      | "FULL_CONTROL";
      adminRef?: string
  }
  
  export type CephAclRule = {
    grantee: "owner" | "authenticated-users" | "all-users";
    permission: CephAclPermission;
  };
  
  export type CephAclPermission = "FULL_CONTROL" | "READ" | "READ_WRITE";

  
export interface BucketDashboardOptions {
  bucket: string;

  uid?: string;          
  startDate?: string;    
  endDate?: string;      
  showLog?: boolean;    
}

export interface BucketUserUsage {
  bucket: string;
  owner: string;         

  bytesSent: number;
  bytesReceived: number;
  ops: number;
  successfulOps: number;
}

export interface BucketDashboardStats {
  bucket: string;

  totalBytesSent: number;
  totalBytesReceived: number;
  totalOps: number;
  totalSuccessfulOps: number;
  raw?: any;
}

export type MinioReplicationUsage = {
  objectsPendingReplicationCount?: number;
  objectsPendingReplicationTotalSize?: number;
  objectsFailedReplicationCount?: number;
  objectsFailedReplicationTotalSize?: number;
  objectsReplicatedTotalSize?: number;
  objectReplicaTotalSize?: number;
};

export type MinioBucketDashboardStats = {
  bucket: string;

  // Top summary
  totalSizeBytes: number;
  objectCount: number;
  versionCount?: number;
  deleteMarkersCount?: number;

  // Bucket config
  lastModified?: string;
  location?: string;

  versioningStatus?: BucketVersioningStatus;

  objectLockEnabled?: boolean;
  objectLockMode?: string;
  objectLockValidity?: string;

  policyType?: string; // "none" etc

  replicationEnabled?: boolean;
  replicationRole?: string;

  encryptionConfigured?: boolean;

  ilmConfigured?: boolean;

  // Optional: quota
  quotaBytes?: number;

  // Distributions
  sizeHistogram?: Record<string, number>;
  versionsHistogram?: Record<string, number>;

  // Replication usage (when enabled)
  replicationUsage?: MinioReplicationUsage;

  raw: any;
};

export type GarageBucketPermission = "R" | "W" | "RW" | string;

export type GarageBucketKeyAccess = {
  permissions: GarageBucketPermission;
  accessKey: string;
  localAliases: string[];
};

export type GarageBucketDashboardStats = {
  bucketId?: string;
  createdAt?: string;

  totalSizeBytes: number;
  objectCount: number;

  quotaBytes?: number;
  maxObjects?: number;

  websiteEnabled?: boolean;

  globalAliases?: string[]; // <-- array, not single
  keys: GarageBucketKeyAccess[];

  raw: string;
};



export type CephDeps = {
  backend: "ceph";
  cephUsers: string[];
  cephPlacementTargets: string[];
  usersLoading: boolean;
  usersError: string | null;
  placementLoading: boolean;
  placementError: string | null;
};

export type GarageDeps = {
  backend: "garage";
  garageKeys: GarageKeyDetail[];
  keysLoading: boolean;
  keysError: string | null;
};

export type MinioDeps = {
  backend: "minio";
};

export type ModalDeps = CephDeps | GarageDeps | MinioDeps;

export type GarageBucketAliasPatch = {
  aliasesAdd?: string[];
  aliasesRemove?: string[];
};

export type GarageBucketKeyGrant = {
  keyIdOrName: string;   
  read: boolean;
  write: boolean;
  owner: boolean;
};

export type McAliasCandidate = {
  alias: string;
};