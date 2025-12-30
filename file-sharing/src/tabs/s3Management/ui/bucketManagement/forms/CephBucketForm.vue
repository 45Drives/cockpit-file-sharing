<!-- forms/CephBucketForm.vue -->
<template>
    <div class="md:col-span-2 mt-2 border-t border-slate-800 pt-3 space-y-4">
        <div class="space-y-2">
            <div class="flex items-center justify-between">
                <label class="text-md font-medium font-semibold text-default">Object Locking</label>
                <div class="flex items-center gap-2">
                    <input id="cephObjectLockEnabled" v-model="form.objectLockEnabled" type="checkbox"
                        :disabled="mode === 'edit'" class="h-4 w-4 rounded border-slate-600 bg-default" />
                    <label for="cephObjectLockEnabled" class="text-md font-semibold text-default">Enable</label>
                </div>
            </div>

            <p class="text-xs text-muted">
                Locking can only be enabled when creating a bucket. In COMPLIANCE mode object versions cannot be
                overwritten or
                deleted during the retention period.
            </p>

            <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
                <label class="flex flex-col gap-1 text-md">
                    <span class="font-medium font-semibold text-default">Mode</span>
                    <select v-model="form.objectLockMode" :disabled="!form.objectLockEnabled || mode === 'edit'"
                        class="rounded-md border border-default bg-default px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 disabled:opacity-60">
                        <option value="GOVERNANCE">GOVERNANCE</option>
                        <option value="COMPLIANCE">COMPLIANCE</option>
                    </select>
                </label>

                <label class="flex flex-col gap-1 text-md">
                    <span class="font-medium font-semibold text-default">Days</span>
                    <input v-model="form.objectLockRetentionDays" type="number" min="1"
                        :disabled="!form.objectLockEnabled || mode === 'edit'" placeholder="e.g. 30"
                        class="rounded-md border border-default bg-default px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 disabled:opacity-60" />
                </label>
            </div>
        </div>

        <div class="space-y-1">
            <div class="flex items-center justify-between">
                <label class="text-md font-medium font-semibold text-default">Versioning</label>
                <div class="flex items-center gap-2">
                    <input id="cephVersioningEnabled" v-model="form.versioningEnabled" type="checkbox"
                        :disabled="versioningLocked" class="h-4 w-4 rounded border-slate-600 bg-default" />
                    <label for="cephVersioningEnabled" class="text-md font-semibold text-default">Enable</label>
                </div>
            </div>

            <p class="text-md text-muted">
                <span v-if="versioningLocked">Versioning is required when Object Lock is enabled.</span>
                <span v-else class="text-xs">Enable or disable versioning on this bucket.</span>
            </p>
        </div>

        <div class="space-y-2">
            <label class="block text-md font-medium font-semibold text-default">Encryption</label>
            <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
                <select v-model="form.encryptionMode"
                    class="rounded-md border border-default bg-default px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1">
                    <option value="none">No default encryption</option>
                    <option value="sse-s3">SSE-S3 Encryption</option>
                    <option value="kms">External KMS (SSE-KMS)</option>
                </select>

                <input v-if="form.encryptionMode === 'kms'" v-model="form.kmsKeyId" type="text"
                    placeholder="KMS key id / alias"
                    class="rounded-md border border-default bg-default px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1" />
            </div>

            <p class="text-md text-muted">
                SSE-S3 uses RGW-managed encryption keys. KMS mode connects to an external key management service.
            </p>
        </div>

        <div class="space-y-2 md:col-span-2">
            <div class="flex items-center justify-between gap-3">
                <label class="block text-md font-medium font-semibold text-default">Bucket policy (JSON)</label>
            </div>

            <textarea v-model="form.bucketPolicyText" rows="10" placeholder="Optional bucket policy JSON"
                class="w-full rounded-md border border-default bg-default px-3 py-2 text-md text-slate-100 outline-none focus:ring-1 font-mono" />

            <p v-if="policyError" class="text-md text-red-400">{{ policyError }}</p>
            <p v-else class="text-md text-muted">Leave empty for no bucket policy. If provided, it must be valid JSON.
            </p>

            <div class="flex items-center gap-2">
                <a href="https://awspolicygen.s3.amazonaws.com/policygen.html" target="_blank" rel="noopener noreferrer"
                    class="rounded-md border border-default bg-secondary px-2.5 py-1 text-md font-medium text-slate-100 hover:bg-slate-800">
                    <span class="inline-flex items-center gap-2">
                        <ArrowTopRightOnSquareIcon class="w-[1rem]" />
                        Policy generator
                    </span>
                </a>

                <a href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/example-bucket-policies.html?icmpid=docs_amazons3_console"
                    target="_blank" rel="noopener noreferrer"
                    class="rounded-md border border-default bg-secondary px-2.5 py-1 text-md font-medium text-slate-100 hover:bg-slate-800">
                    <span class="inline-flex items-center gap-2">
                        <ArrowTopRightOnSquareIcon class="w-[1rem]" />
                        Examples
                    </span>
                </a>

                <button type="button"
                    class="rounded-md border border-default bg-primary px-2.5 py-1 text-md font-medium text-slate-100 hover:bg-slate-800 disabled:opacity-50"
                    :disabled="!form.bucketPolicyText?.trim()" @click="clearPolicy">
                    Clear
                </button>
            </div>
        </div>

        <div class="mt-2 border-t border-slate-800 pt-3 space-y-3">
            <label class="block text-md font-medium font-semibold text-default">Access control (ACL)</label>

            <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
                <label class="flex flex-col gap-1 text-md">
                    <span class="font-medium font-semibold text-default">Grantee</span>
                    <select v-model="form.aclScope"
                        class="rounded-md border border-default bg-default px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1">
                        <option value="owner">Owner</option>
                        <option value="authenticated-users">Authenticated users</option>
                        <option value="all-users">All users (public)</option>
                    </select>
                </label>

                <label class="flex flex-col gap-1 text-md">
                    <span class="font-medium font-semibold text-default">Permission</span>
                    <select v-model="form.aclPermission"
                        class="rounded-md border border-default bg-default px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1">
                        <option v-for="o in aclPermissionOptions" :key="o.value" :value="o.value">
                            {{ o.label }}
                        </option>
                    </select>
                </label>
            </div>

            <p class="text-md text-muted">Applies a simple ACL rule on create/edit.</p>
        </div>

        <div v-if="mode !== 'edit'" class="mt-2 border-t border-slate-800 pt-3 space-y-2">
            <label class="block text-md font-medium font-semibold text-default">Placement target</label>

            <select v-model="form.placementTarget"
                class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 disabled:opacity-60">
                <option value="">Default</option>
                <option v-for="t in (deps?.cephPlacementTargets ?? [])" :key="t" :value="t">
                    {{ t }}
                </option>
            </select>

            <p v-if="deps?.placementLoading" class="text-md text-muted">Loading placement targets…</p>
            <p v-else-if="deps?.placementError" class="text-md text-red-400">{{ deps.placementError }}</p>
            <p v-else class="text-md text-muted">
                When creating a bucket, a placement target can be provided as part of the LocationConstraint to override
                the
                default placement targets from the user and zonegroup.
            </p>
        </div>

        <p v-if="error" class="text-sm text-red-400">{{ error }}</p>
    </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { ArrowTopRightOnSquareIcon } from "@heroicons/vue/20/solid";

import type {
    CephAclPermission,
    CephAclRule,
    CephBucket,
    CephBucketCreateOptions,
    CephBucketUpdatePayload,
    CephDeps,
} from "../../../types/types";

import type { BucketCreateForm, BucketEditForm, BucketFormData } from "../../../bucketBackends/bucketBackend";

const props = defineProps<{
    mode: "create" | "edit";
    bucket: CephBucket | null;
    deps: CephDeps | null;
}>();

const error = ref<string | null>(null);
const policyError = ref<string | null>(null);

const form = reactive({
    objectLockEnabled: false,
    objectLockMode: "COMPLIANCE" as "GOVERNANCE" | "COMPLIANCE",
    objectLockRetentionDays: "",

    versioningEnabled: false,

    encryptionMode: "none" as "none" | "sse-s3" | "kms",
    kmsKeyId: "",

    bucketPolicyText: "",

    aclScope: "owner" as CephAclRule["grantee"],
    aclPermission: "FULL_CONTROL" as CephAclPermission,

    placementTarget: "",
});

const objectLockActive = computed(() => {
    if (props.mode === "edit") return !!props.bucket?.objectLockEnabled;
    return !!form.objectLockEnabled;
});

const versioningLocked = computed(() => objectLockActive.value);

const aclPermissionOptions = computed((): { value: CephAclPermission; label: string }[] => {
    if (form.aclScope === "owner") return [{ value: "FULL_CONTROL", label: "Full control" }];
    if (form.aclScope === "authenticated-users") return [{ value: "READ", label: "Read" }];
    return [
        { value: "READ", label: "Read" },
        { value: "READ_WRITE", label: "Read and write" },
    ];
});

watch(
    objectLockActive,
    (locked) => {
        if (locked) form.versioningEnabled = true;
    },
    { immediate: true }
);

watch(
    () => form.aclScope,
    (scope) => {
        if (scope === "owner") form.aclPermission = "FULL_CONTROL";
        else if (scope === "authenticated-users") form.aclPermission = "READ";
        else if (form.aclPermission !== "READ" && form.aclPermission !== "READ_WRITE") form.aclPermission = "READ";
    },
    { immediate: true }
);

watch(
    () => form.bucketPolicyText,
    (val) => {
        const text = (val ?? "").trim();
        if (!text) {
            policyError.value = null;
            return;
        }
        try {
            JSON.parse(text);
            policyError.value = null;
        } catch {
            policyError.value = "Bucket policy must be valid JSON.";
        }
    }
);

function clearPolicy() {
    form.bucketPolicyText = "";
    policyError.value = null;
}

function reset() {
    error.value = null;
    policyError.value = null;

    form.objectLockEnabled = false;
    form.objectLockMode = "COMPLIANCE";
    form.objectLockRetentionDays = "";

    form.versioningEnabled = false;

    form.encryptionMode = "none";
    form.kmsKeyId = "";

    form.bucketPolicyText = "";

    form.aclScope = "owner";
    form.aclPermission = "FULL_CONTROL";

    form.placementTarget = "";
}

function initFromProps() {
    reset();

    if (props.mode !== "edit") return;
    const b = props.bucket;
    if (!b) return;

    form.objectLockEnabled = !!b.objectLockEnabled;
    form.versioningEnabled = b.versioning === "Enabled";

    form.bucketPolicyText = b.policy ?? "";

    const aclRules = (b.acl ?? []) as CephAclRule[];
    const publicRule = aclRules.find((r) => r.grantee === "all-users");
    const authRule = aclRules.find((r) => r.grantee === "authenticated-users");
    const ownerRule = aclRules.find((r) => r.grantee === "owner");

    const chosen =
        publicRule ||
        authRule ||
        ownerRule || {
            grantee: "owner" as const,
            permission: "FULL_CONTROL" as CephAclPermission,
        };

    form.aclScope = chosen.grantee;
    form.aclPermission = chosen.permission;
}

watch(() => [props.mode, props.bucket], initFromProps, { immediate: true });

function validate(): boolean {
    error.value = null;

    const policyText = (form.bucketPolicyText ?? "").trim();
    if (policyText) {
        try {
            JSON.parse(policyText);
            policyError.value = null;
        } catch {
            policyError.value = "Bucket policy must be valid JSON.";
            return false;
        }
    }

    if (form.objectLockEnabled && props.mode === "create") {
        const days = Number(form.objectLockRetentionDays);
        if (!Number.isFinite(days) || days < 1) {
            error.value = "Object lock retention days must be >= 1.";
            return false;
        }
    }

    if (form.encryptionMode === "kms" && !form.kmsKeyId.trim()) {
        error.value = "KMS key id / alias is required when encryption mode is KMS.";
        return false;
    }

    return true;
}

function build(args: {
    name: string;
    region?: string | undefined;
    ownerUid?: string | undefined;
    tagsText?: string;
}): BucketFormData {
    const policyText = (form.bucketPolicyText ?? "").trim();
    const bucketPolicy: string | null = policyText ? policyText : null;

    const cephAclRules = [
        {
            grantee: form.aclScope,
            permission: form.aclPermission,
        },
    ];

    if (props.mode === "create") {
        const cephCreate: CephBucketCreateOptions = {
            name: args.name,
            ownerUid: args.ownerUid || undefined,
            region: args.region || undefined,
            placementTarget: form.placementTarget || undefined,

            objectLockEnabled: !!form.objectLockEnabled,
            objectLockMode: form.objectLockMode,
            objectLockRetentionDays: form.objectLockRetentionDays ? Number(form.objectLockRetentionDays) : undefined,

            encryptionMode: form.encryptionMode,
            kmsKeyId: form.encryptionMode === "kms" ? form.kmsKeyId || undefined : undefined,

            bucketPolicy: policyText || undefined,
            aclRules: cephAclRules,
        };

        return {
            backend: "ceph",
            region: args.region || undefined,
            tagsText: args.tagsText ?? "",
            ...cephCreate,
        } satisfies BucketCreateForm;
    }

    const cephEdit: CephBucketUpdatePayload = {
        name: args.name,
        region: args.region || undefined,
        owner: args.ownerUid || undefined,
        tagsText: args.tagsText ?? "",

        cephVersioningEnabled: !!form.versioningEnabled,
        cephEncryptionMode: form.encryptionMode,
        cephKmsKeyId: form.encryptionMode === "kms" ? form.kmsKeyId || undefined : undefined,

        bucketPolicy,

        cephObjectLockMode: form.objectLockMode,
        cephObjectLockRetentionDays: form.objectLockRetentionDays || undefined,

        cephAclRules,
    };

    return {
        backend: "ceph",
        ...cephEdit,
    } satisfies BucketEditForm;
}

defineExpose({ validate, build });
</script>