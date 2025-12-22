<!-- GarageBucketFields.vue -->
<template>
    <div class="md:col-span-2 mt-2 border-t border-slate-800 pt-3 space-y-3">
      <div class="flex gap-2">
        <div class="flex-1">
          <label class="mb-1 block text-md font-medium font-semibold text-default">Max size</label>
          <input
            v-model="form.garageMaxSize"
            type="number"
            min="0"
            placeholder="e.g. 30"
            class="w-full rounded-md border border-default bg-default px-3 py-2.5 text-base text-slate-100 outline-none focus:ring-1"
          />
        </div>
        <div class="w-24">
          <label class="mb-1 block text-md font-medium font-semibold text-default">Unit</label>
          <select
            v-model="form.garageMaxSizeUnit"
            class="w-full rounded-md border border-default bg-default px-3 py-2.5 text-base text-slate-100 outline-none focus:ring-1"
          >
            <option value="MiB">MiB</option>
            <option value="GiB">GiB</option>
            <option value="TiB">TiB</option>
          </select>
        </div>
      </div>
  
      <div>
        <label class="mb-1 block text-md font-medium font-semibold text-default">Max objects</label>
        <input
          v-model="form.garageMaxObjects"
          type="number"
          min="0"
          placeholder="e.g. 100000"
          class="w-full rounded-md border border-default bg-default px-3 py-2.5 text-base text-slate-100 outline-none focus:ring-1"
        />
      </div>
  
      <div class="space-y-2">
        <label class="block text-md font-medium font-semibold text-default">Grant access keys</label>
  
        <p v-if="deps?.keysLoading" class="text-md text-muted">Loading Garage keys…</p>
        <p v-else-if="deps?.keysError" class="text-md text-red-400">{{ deps.keysError }}</p>
  
        <div v-else class="space-y-2">
          <div class="text-md text-muted">
            Select keys that should access this bucket, then set permissions.
          </div>
  
          <div
            v-for="k in (deps?.garageKeys ?? [])"
            :key="k.id"
            class="flex items-center justify-between gap-3 rounded-md border border-default bg-default px-3 py-2"
          >
            <div class="min-w-0">
              <div class="text-md font-medium text-slate-200 truncate">{{ k.name || k.id }}</div>
              <div class="text-sm text-muted font-mono truncate">{{ k.id }}</div>
            </div>
  
            <div class="flex items-center gap-3">
              <input
                type="checkbox"
                class="h-4 w-4 rounded border-slate-600 bg-default"
                :checked="isGranted(k.id, k.name)"
                @change="toggleGrant(k.id, k.name, ($event.target as HTMLInputElement).checked)"
              />
  
              <div v-if="isGranted(k.id, k.name)" class="flex items-center gap-2 text-md">
                <label class="flex items-center gap-1">
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-slate-600 bg-default"
                    v-model="grantFor(k.id, k.name).read"
                  />
                  <span>Read</span>
                </label>
  
                <label class="flex items-center gap-1">
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-slate-600 bg-default"
                    v-model="grantFor(k.id, k.name).write"
                  />
                  <span>Write</span>
                </label>
  
                <label class="flex items-center gap-1">
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-slate-600 bg-default"
                    v-model="grantFor(k.id, k.name).owner"
                  />
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
  
      <div>
        <label class="mb-1 block text-md font-medium font-semibold text-default">Aliases</label>
        <input
          v-model="form.garageAliasesText"
          type="text"
          placeholder="Comma-separated, e.g. public-assets,cdn-bucket"
          class="w-full rounded-md border border-default bg-default px-3 py-2.5 text-base text-slate-100 outline-none focus:ring-1"
        />
        <p class="mt-1 text-md text-muted">
          Each alias will be created with
          <code>garage bucket alias &lt;bucket&gt; &lt;alias&gt;</code>.
        </p>
      </div>
    </div>
</template>
  
  <script setup lang="ts">
  import type { GarageDeps, GarageBucketKeyGrant } from "../../types/types";
  
  type GarageFormShape = {
    garageMaxSize: string;
    garageMaxSizeUnit: "MiB" | "GiB" | "TiB";
    garageMaxObjects: string;
    garageAliasesText: string;
    garageGrants: GarageBucketKeyGrant[];
  };
  
  const props = defineProps<{
    form: GarageFormShape;
    deps: GarageDeps | null;
  }>();
  
  function keyHandle(id: string, name?: string) {
    return name?.trim() ? name.trim() : id;
  }
  
  function isGranted(id: string, name?: string) {
    const h = keyHandle(id, name);
    return props.form.garageGrants.some((g) => g.keyIdOrName === h);
  }
  
  function grantFor(id: string, name?: string) {
    const h = keyHandle(id, name);
  
    let g = props.form.garageGrants.find((x) => x.keyIdOrName === h);
    if (!g) {
      g = { keyIdOrName: h, read: true, write: false, owner: false };
      props.form.garageGrants.push(g);
    }
    return g;
  }
  
  function toggleGrant(id: string, name: string | undefined, checked: boolean) {
    const h = keyHandle(id, name);
  
    if (checked) {
      if (!props.form.garageGrants.some((g) => g.keyIdOrName === h)) {
        props.form.garageGrants.push({ keyIdOrName: h, read: true, write: false, owner: false });
      }
    } else {
      props.form.garageGrants = props.form.garageGrants.filter((g) => g.keyIdOrName !== h);
    }
  }
  </script>
  