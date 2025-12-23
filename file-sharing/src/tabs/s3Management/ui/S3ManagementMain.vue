<!-- S3MainManagementView.vue -->
<template>
  <div class="page">
    <div v-if="loadingConfig">
      Detecting storage backends…
    </div>

    <div v-else-if="availableBackends.length === 0">
      <p class="error">
        No storage backend is available. MinIO, Ceph RGW, and Garage appear to be
        misconfigured or unreachable.
      </p>
    </div>

    <div v-else>
      <!-- STEP 1: choose backend -->
      <div v-if="step === 1">
        <h2 class="text-3xl font-semibold mb-6">Select backend</h2>

        <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <button
            v-for="b in availableBackends"
            :key="b.value"
            type="button"
            :disabled="loadingConfig"
            @click="chooseBackend(b.value)"
            class="w-full text-left rounded-2xl border border-default bg-accent p-6 transition
                   hover:-translate-y-0.5 hover:shadow-lg
                   disabled:opacity-60 disabled:cursor-not-allowed"
            :class="selectedBackend === b.value
              ? 'ring-2 ring-primary ring-offset-2 ring-offset-accent'
              : 'ring-0'"
          >
            <div class="text-2xl font-semibold">
              {{ b.label }}
            </div>
            <div class="mt-2 text-base opacity-80">
              Click to manage buckets and access
            </div>
          </button>
        </div>
      </div>

      <!-- STEP 2: choose view (after backend) -->
      <div v-else-if="step === 2 && selectedBackend">
        <div class="flex items-center justify-between mb-4">


          <button type="button" class="primary-button" @click="goBackToBackendSelection">
            Back
          </button>
        </div>

        <!-- MinIO alias selector -->
        <div v-if="selectedBackend === 'minio'" class="mb-6 w-9/12 mx-auto">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-xl font-semibold">MinIO alias</h3>

            <button
              type="button"
              class="btn btn-secondary"
              @click="loadMinioAliasesIfNeeded"
              :disabled="loadingMinioAliases"
            >
              Refresh
            </button>
          </div>

          <div v-if="loadingMinioAliases" class="opacity-80">
            Loading aliases…
          </div>

          <div v-else-if="minioAliasError" class="text-red-600">
            {{ minioAliasError }}
          </div>

          <div v-else-if="minioAliases.length === 0" class="opacity-80">
            No usable MinIO aliases found.
          </div>

          <div v-else>
            <select
              v-model="selectedMinioAlias"
              class="w-full rounded-lg border border-default bg-accent px-4 py-3"
            >
              <option disabled value="">Select an alias…</option>
              <option v-for="a in minioAliases" :key="a.alias" :value="a.alias">
                {{ a.alias }}{{ a.url ? ` (${a.url})` : "" }}
              </option>
            </select>

            <div class="mt-2 text-sm opacity-70">
              Select the mc alias that points to the MinIO instance you want to manage.
            </div>
          </div>
        </div>

        <!-- Ceph gateway errors / loading -->
        <div v-if="selectedBackend === 'ceph'" class="w-9/12 mx-auto mb-6">
          <div v-if="loadingGateways" class="opacity-80">Loading Ceph gateways…</div>
          <div v-else-if="gatewayError" class="text-red-600">{{ gatewayError }}</div>
        </div>

        <!-- view choice buttons -->
        <div class="grid grid-cols-2 gap-10 text-2xl w-9/12 mx-auto">
          <CardContainer class="col-span-1 bg-accent border-default rounded-md">
            <div>
              <ArchiveBoxIcon class="w-[50%] icon-default mx-auto" />
            </div>

            <template #footer>
              <button
                type="button"
                class="btn btn-secondary w-full text-6xl"
                @click="chooseView('buckets')"
                :disabled="selectedBackend === 'minio' && !selectedMinioAlias"
              >
                Bucket Management
              </button>
            </template>
          </CardContainer>

          <CardContainer class="col-span-1 bg-accent border-default rounded-md">
            <div>
              <AccIcon class="w-[50%] mx-auto icon-default" />
            </div>

            <template #footer>
              <button
                type="button"
                class="btn btn-secondary w-full text-6xl"
                @click="chooseView('users')"
                :disabled="selectedBackend === 'minio' && !selectedMinioAlias"
              >
                Access Management
              </button>
            </template>
          </CardContainer>
        </div>
      </div>

      <!-- STEP 3: actual views -->
      <div v-else-if="step === 3 && selectedBackend && selectedView">
        <S3BucketsView
          v-if="selectedView === 'buckets'"
          :backend="selectedBackend"
          :cephGateway="selectedGateway"
          :minioAlias="selectedMinioAlias"
          :showBackButton="true"
          @backToViewSelection="() => { step = 2; selectedView = null; }"
        />

        <template v-else-if="selectedView === 'users'">
          <UsersView
            v-if="selectedBackend === 'ceph'"
            :showBackButton="true"
            @backToViewSelection="() => { step = 2; selectedView = null; }"
          />

          <div v-else-if="selectedBackend === 'minio'">
            <MinioAccessManagement
              :minioAlias="selectedMinioAlias"
              @backToViewSelection="() => { step = 2; selectedView = null; }"
            />
          </div>

          <GarageKeysPage
            v-else-if="selectedBackend === 'garage'"
            @backToViewSelection="() => { step = 2; selectedView = null; }"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import S3BucketsView from "./bucketManagement/S3BucketsView.vue";
import { isCephRgwHealthy, listRgwGateways } from "../api/cephCliAdapter";
import {
  isMinioAvailable,
  listMinioAliasCandidates,
  setMinioAlias,
} from "../api/minioCliAdapter";
import { isGarageHealthy } from "../api/garageCliAdapter";
import UsersView from "./accessManagementViews/CephRgw/UsersView.vue";
import MinioAccessManagement from "./accessManagementViews/minio/MinioAccessManagement.vue";
import GarageKeysPage from "./accessManagementViews/GarageHq/GarageKeysPage.vue";
import { CardContainer } from "@45drives/houston-common-ui";
import { ArchiveBoxIcon } from "@heroicons/vue/20/solid";
import AccIcon from "../images/AccIcon.vue";
import type { RgwGateway } from "../types/types";
import { pushNotification,Notification } from "@45drives/houston-common-ui";

type Backend = "minio" | "ceph" | "garage";
type View = "buckets" | "users";

type MinioAliasOption = {
  alias: string;
  url?: string;
};

const loadingConfig = ref(false);

const isMinioAvailableFlag = ref(false);
const isCephAvailable = ref(false);
const isGarageAvailable = ref(false);

const step = ref<1 | 2 | 3>(1);

const selectedBackend = ref<Backend | null>(null);
const selectedView = ref<View | null>(null);

// Ceph gateways
const gateways = ref<RgwGateway[]>([]);
const loadingGateways = ref(false);
const gatewayError = ref<string | null>(null);
const selectedGatewayId = ref<string | null>(null);

const selectedGateway = computed<RgwGateway | null>(() => {
  if (!selectedGatewayId.value) return null;
  return gateways.value.find((g) => g.id === selectedGatewayId.value) || null;
});

// MinIO aliases
const loadingMinioAliases = ref(false);
const minioAliases = ref<MinioAliasOption[]>([]);
const selectedMinioAlias = ref<string>("");
const minioAliasError = ref<string | null>(null);

const availableBackends = computed(() => {
  const list: { value: Backend; label: string }[] = [];
  if (isMinioAvailableFlag.value) list.push({ value: "minio", label: "MinIO" });
  if (isCephAvailable.value) list.push({ value: "ceph", label: "Ceph RGW" });
  if (isGarageAvailable.value) list.push({ value: "garage", label: "Garage" });
  return list;
});

async function detectBackends() {
  loadingConfig.value = true;

  try {
    const results = await Promise.allSettled([
      isMinioAvailable(),
      isGarageHealthy(),
      isCephRgwHealthy(),
    ]);

    const [minioRes, garageRes, cephRes] = results;

    isMinioAvailableFlag.value =
      minioRes.status === "fulfilled" ? !!minioRes.value : false;

    isGarageAvailable.value =
      garageRes.status === "fulfilled" ? !!garageRes.value : false;

    isCephAvailable.value =
      cephRes.status === "fulfilled" ? !!cephRes.value : false;

    if (minioRes.status === "rejected") {
      pushNotification(new Notification("MinIO detection failed", String(minioRes.reason), "error"));
    }
    if (garageRes.status === "rejected") {
      pushNotification(new Notification("Garage detection failed", String(garageRes.reason), "error"));
    }
    if (cephRes.status === "rejected") {
      pushNotification(new Notification("Ceph RGW detection failed", String(cephRes.reason), "error"));
    }

    selectedBackend.value = null;
    selectedView.value = null;
    step.value = 1;
  } finally {
    loadingConfig.value = false;
  }
}


async function loadGatewaysIfNeeded() {
  if (selectedBackend.value !== "ceph") return;
  if (!isCephAvailable.value) return;

  loadingGateways.value = true;
  gatewayError.value = null;

  try {
    const list = (await listRgwGateways()) ?? [];
    gateways.value = list;

    const first = list[0];
    if (!first) {
      selectedGatewayId.value = null;
      return;
    }

    const defaultGw = list.find((g) => g.isDefault);
    selectedGatewayId.value = (defaultGw ?? first).id;
  } catch (e: any) {
    pushNotification(new Notification("Failed to list Ceph gateways", e?.message, "error"));
    gateways.value = [];
    selectedGatewayId.value = null;
  } finally {
    loadingGateways.value = false;
  }
}



async function loadMinioAliasesIfNeeded() {
  if (selectedBackend.value !== "minio") return;

  loadingMinioAliases.value = true;
  minioAliasError.value = null;
  minioAliases.value = [];
  selectedMinioAlias.value = "";

  try {
    const list = await listMinioAliasCandidates();

    const normalized: MinioAliasOption[] = (list as any[])
      .map((x) => {
        if (typeof x === "string") return { alias: x };
        return {
          alias: String(x.alias ?? "").trim(),
          url: typeof x.url === "string" ? x.url : typeof x.URL === "string" ? x.URL : undefined,
        };
      })
      .filter((x) => x.alias);

    minioAliases.value = normalized;

    if (minioAliases.value.length === 1) {
      selectedMinioAlias.value = minioAliases.value[0].alias;
    }
  } catch (e: any) {
    pushNotification(new Notification( `Failed to list MinIO aliases`,e?.message ,"error"));

    // minioAliasError.value = e?.message ?? "Failed to list MinIO aliases";
  } finally {
    loadingMinioAliases.value = false;
  }
}

async function chooseBackend(backend: Backend) {
  selectedBackend.value = backend;
  selectedView.value = null;

  if (backend !== "ceph") {
    gateways.value = [];
    selectedGatewayId.value = null;
    gatewayError.value = null;
  }

  if (backend !== "minio") {
    minioAliases.value = [];
    selectedMinioAlias.value = "";
    minioAliasError.value = null;
  }

  if (backend === "ceph") {
    await loadGatewaysIfNeeded();
  }

  if (backend === "minio") {
    await loadMinioAliasesIfNeeded();
  }

  step.value = 2;
}

function chooseView(view: View) {
  selectedView.value = view;
  step.value = 3;
}

function goBackToBackendSelection() {
  step.value = 1;
  selectedBackend.value = null;
  selectedView.value = null;

  gateways.value = [];
  selectedGatewayId.value = null;
  gatewayError.value = null;

  minioAliases.value = [];
  selectedMinioAlias.value = "";
  minioAliasError.value = null;
}

// This is the glue that makes your existing minioCliAdapter (which uses MINIO_ALIAS internally)
// follow the UI selection without refactoring every function signature right now.
watch(
  () => selectedMinioAlias.value,
  (alias) => {
    if (alias && alias.trim()) {
      setMinioAlias(alias.trim());
    }
  }
);

onMounted(() => {
  detectBackends();
});
</script>
