<template>
    <div class="space-y-3">
        <!-- Name -->
        <div class="w-full min-w-0">
            <label class="mb-1 block text-md font-medium text-slate-300">Bucket name</label>
            <input v-model="form.name" :disabled="mode === 'edit'" type="text" required
                class="w-full rounded-md border border-default bg-default px-3 py-2.5 text-base text-slate-100 outline-none focus:ring-1 disabled:opacity-60" />
        </div>

        <div class="mt-2 border-t border-slate-800 pt-3 space-y-3">
            <!-- Quota -->
            <div class="flex gap-2">
                <div class="flex-1">
                    <label class="mb-1 block text-md font-medium font-semibold text-default">Max size</label>
                    <input v-model="form.garageMaxSize" type="number" min="0" placeholder="e.g. 30"
                        class="w-full rounded-md border border-default bg-default px-3 py-2.5 text-base text-slate-100 outline-none focus:ring-1" />
                </div>
                <div class="w-24">
                    <label class="mb-1 block text-md font-medium font-semibold text-default">Unit</label>
                    <select v-model="form.garageMaxSizeUnit"
                        class="w-full rounded-md border border-default bg-default px-3 py-2.5 text-base text-slate-100 outline-none focus:ring-1">
                        <option value="MiB">MiB</option>
                        <option value="GiB">GiB</option>
                        <option value="TiB">TiB</option>
                    </select>
                </div>
            </div>

            <!-- Max objects -->
            <div>
                <label class="mb-1 block text-md font-medium font-semibold text-default">Max objects</label>
                <input v-model="form.garageMaxObjects" type="number" min="0" placeholder="e.g. 100000"
                    class="w-full rounded-md border border-default bg-default px-3 py-2.5 text-base text-slate-100 outline-none focus:ring-1" />
            </div>

            <!-- Grants -->
            <div class="space-y-2">
                <label class="block text-md font-medium font-semibold text-default">Grant access keys</label>

                <p v-if="deps?.keysLoading" class="text-md text-muted">Loading Garage keys…</p>
                <p v-else-if="deps?.keysError" class="text-md text-red-400">{{ deps.keysError }}</p>

                <div v-else class="space-y-2">
                    <div class="text-md text-muted">
                        Select keys that should access this bucket, then set permissions.
                    </div>

                    <div v-for="k in (deps?.garageKeys ?? [])" :key="k.id"
                        class="flex items-center justify-between gap-3 rounded-md border border-default bg-default px-3 py-2">
                        <div class="min-w-0">
                            <div class="text-md font-medium text-slate-200 truncate">{{ k.name || k.id }}</div>
                            <div class="text-sm text-muted font-mono truncate">{{ k.id }}</div>
                        </div>

                        <div class="flex items-center gap-3">
                            <input type="checkbox" class="h-4 w-4 rounded border-slate-600 bg-default"
                                :checked="isGranted(k.id)"
                                @change="toggleGrant(k.id, ($event.target as HTMLInputElement).checked)" />

                            <div v-if="getGrant(k.id)" class="flex items-center gap-2 text-md">
                                <label class="flex items-center gap-1">
                                    <input type="checkbox" class="h-4 w-4 rounded border-slate-600 bg-default"
                                        :checked="!!getGrant(k.id)?.read" @change="toggleGrantPerm(k.id, 'read')" />
                                    <span>Read</span>
                                </label>

                                <label class="flex items-center gap-1">
                                    <input type="checkbox" class="h-4 w-4 rounded border-slate-600 bg-default"
                                        :checked="!!getGrant(k.id)?.write" @change="toggleGrantPerm(k.id, 'write')" />
                                    <span>Write</span>
                                </label>

                                <label class="flex items-center gap-1">
                                    <input type="checkbox" class="h-4 w-4 rounded border-slate-600 bg-default"
                                        :checked="!!getGrant(k.id)?.owner" @change="toggleGrantPerm(k.id, 'owner')" />
                                    <span>Owner</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <p class="text-md text-muted">
                    Owner is required for some bucket admin actions (example: website config via S3 APIs).
                </p>
            </div>

            <!-- Aliases -->
            <div class="space-y-2">
                <label class="mb-1 block text-md font-medium font-semibold text-default">Aliases</label>

                <div class="space-y-2">
                    <div class="flex gap-2">
                        <input :value="form.name" disabled
                            class="flex-1 rounded-md border border-default bg-default px-3 py-2.5 text-base text-slate-100 outline-none focus:ring-1 disabled:opacity-60" />
                        <span
                            class="rounded-md border border-default bg-default px-2 py-2 text-md font-medium text-slate-300">
                            Required
                        </span>
                    </div>

                    <div v-for="(a, index) in form.garageAliases" :key="index" class="flex gap-2">
                        <input v-model="a.value" type="text" placeholder="e.g. public-assets"
                            class="flex-1 rounded-md border border-default bg-default px-3 py-2.5 text-base text-slate-100 outline-none focus:ring-1" />

                        <button type="button" @click="removeAliasRow(index)"
                            class="rounded-md border border-default bg-default px-2 py-2 text-md font-medium text-slate-100 hover:bg-slate-800">
                            Remove
                        </button>
                    </div>

                    <div class="flex flex-wrap items-center gap-2">
                        <button type="button" @click="addAliasRow"
                            class="rounded-md border border-default bg-secondary px-3 py-2 text-md font-medium text-slate-100 hover:bg-slate-900">
                            Add alias
                        </button>

                        <span class="text-sm text-muted">
                            {{ form.garageAliases.length }}
                        </span>
                    </div>
                </div>

                <p class="text-md text-muted">
                    The bucket name is always the primary alias. Add optional additional aliases below.
                </p>
            </div>

            <!-- Basic form error -->
            <p v-if="error" class="text-sm text-red-400">{{ error }}</p>
        </div>
    </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import type { GarageBucket, GarageDeps, GarageBucketOptions, GarageBucketKeyGrant, GarageBucketKeyAccess } from "../../../types/types";
import type { BucketFormData } from "../../../bucketBackends/bucketBackend";
import { splitBytesBinary } from "../../../bucketBackends/bucketUtils";
import { getGarageBucketDashboardStats } from "../../../api/garageCliAdapter";

const props = defineProps<{
    mode: "create" | "edit";
    bucket: GarageBucket | null;
    deps: (GarageDeps & { keysLoading?: boolean; keysError?: string | null }) | null;
}>();

const error = ref<string | null>(null);
const originalAliases = ref<string[]>([]);
const lastPrefillHandle = ref<string | null>(null);

const form = reactive({
    name: "",
    garageMaxSize: "",
    garageMaxSizeUnit: "GiB" as "MiB" | "GiB" | "TiB",
    garageMaxObjects: "",
    garageAliases: [] as Array<{ value: string }>,
    garageGrants: [] as GarageBucketKeyGrant[],
});

function reset() {
    error.value = null;
    originalAliases.value = [];
    lastPrefillHandle.value = null;

    form.name = "";
    form.garageMaxSize = "";
    form.garageMaxSizeUnit = "GiB";
    form.garageMaxObjects = "";
    form.garageAliases = [];
    form.garageGrants = [];
}

function initFromProps() {
    reset();

    if (props.mode === "create") {
        return;
    }

    const b = props.bucket;
    if (!b) return;

    form.name = b.name;

    form.garageMaxObjects = b.garageMaxObjects != null ? String(b.garageMaxObjects) : "";

    const quotaBytes = b.quotaBytes;
    if (typeof quotaBytes === "number" && quotaBytes > 0) {
        const { value, unit } = splitBytesBinary(quotaBytes);
        form.garageMaxSize = String(value);
        form.garageMaxSizeUnit = unit;
    }

    const base = b.name.trim();
    const extras = Array.from(
        new Set((b.garageAliases ?? []).map((x) => x.trim()).filter(Boolean).filter((x) => x !== base))
    );

    originalAliases.value = extras;
    form.garageAliases = extras.map((x) => ({ value: x }));
}

watch(() => [props.mode, props.bucket], initFromProps, { immediate: true });

function keyHandle(id: string) {
    return id.trim();
}

function getGrant(id: string) {
    const h = keyHandle(id);
    return form.garageGrants.find((g) => g.keyIdOrName === h) ?? null;
}

function isGranted(id: string) {
    return !!getGrant(id);
}

function ensureGrant(id: string) {
    const h = keyHandle(id);
    let g = form.garageGrants.find((x) => x.keyIdOrName === h);
    if (!g) {
        g = { keyIdOrName: h, read: true, write: false, owner: false };
        form.garageGrants.push(g);
    }
    return g;
}

function toggleGrant(id: string, checked: boolean) {
    const h = keyHandle(id);
    if (checked) {
        ensureGrant(h);
    } else {
        form.garageGrants = form.garageGrants.filter((g) => g.keyIdOrName !== h);
    }
}

function toggleGrantPerm(id: string, perm: "read" | "write" | "owner") {
    const g = getGrant(id);
    if (!g) return;
    g[perm] = !g[perm];
}

function addAliasRow() {
    form.garageAliases.push({ value: "" });
}

function removeAliasRow(index: number) {
    if (index < 0 || index >= form.garageAliases.length) return;
    form.garageAliases.splice(index, 1);
}

function normPerm(p: string | undefined): string {
    return (p ?? "").trim().toUpperCase();
}

function accessToGrant(accessKey: string, permissions: string): GarageBucketKeyGrant {
    const p = normPerm(permissions);
    const read = p.includes("R");
    const write = p.includes("W");
    const owner = p.includes("O") || p.includes("OWNER");
    return { keyIdOrName: accessKey.trim(), read, write, owner };
}

/**
 * Prefill grants on edit by querying current perms.
 * Uses (bucket.garageId ?? bucket.name) as handle like you did.
 * Guarded to avoid refetch loops.
 */
watch(
    () => [props.mode, props.bucket, props.deps] as const,
    async () => {
        if (props.mode !== "edit") return;
        const b = props.bucket;
        if (!b) return;

        const handle = String(((b as any).garageId ?? b.name) ?? "").trim();
        if (!handle) return;
        if (lastPrefillHandle.value === handle) return;

        lastPrefillHandle.value = handle;

        try {
            const stats = await getGarageBucketDashboardStats(handle);
            const keys = (stats as any).keys as GarageBucketKeyAccess[] | undefined;

            if (Array.isArray(keys)) {
                form.garageGrants = keys.map((k) => accessToGrant(k.accessKey, k.permissions));
            }
        } catch {
            // keep whatever user has selected locally
        }
    },
    { immediate: true }
);

function validate(): boolean {
    error.value = null;

    if (!form.name.trim()) {
        error.value = "Bucket name is required.";
        return false;
    }

    if (form.garageMaxSize && Number(form.garageMaxSize) < 0) {
        error.value = "Max size must be >= 0.";
        return false;
    }

    if (form.garageMaxObjects && Number(form.garageMaxObjects) < 0) {
        error.value = "Max objects must be >= 0.";
        return false;
    }

    return true;
}

function build(): BucketFormData {
    const quota = form.garageMaxSize
        ? `${form.garageMaxSize}${form.garageMaxSizeUnit}`
        : null;

    const base = form.name.trim();
    const aliasList = Array.from(
        new Set(
            form.garageAliases
                .map((x) => x.value.trim())
                .filter(Boolean)
                .filter((x) => x !== base)
        )
    );

    const desiredSet = new Set(aliasList);
    const removed = originalAliases.value.filter((a) => !desiredSet.has(a));

    const garage: GarageBucketOptions = {
        quota,
        maxObjects: form.garageMaxObjects ? Number(form.garageMaxObjects) : null,
        website: {
            enable: false,
            indexDocument: undefined,
            errorDocument: undefined,
        },
        aliases: aliasList.length ? aliasList : null,
        garageAliasesRemove: removed.length ? removed : null,
        allow: null,
        deny: null,
        extraArgs: null,
    };

    return {
        backend: "garage",
        name: form.name,
        garage,
        grants: form.garageGrants,
    };
}

defineExpose({ validate, build });
</script>