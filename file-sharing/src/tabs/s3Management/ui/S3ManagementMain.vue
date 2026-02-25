<!-- S3MainManagementView.vue -->
<template>
  <div class="page">
    <div v-if="loadingConfig">
      Detecting storage backends…
    </div>

    <div v-else-if="availableBackends.length === 0">
      <p class="error">
        No storage backend is available. MinIO, RustFS, Ceph RGW, and Garage appear to be
        misconfigured or unreachable.
      </p>
    </div>

    <div v-else>
      <!-- STEP 1: choose backend -->
      <div v-if="step === 1">
        <h2 class="text-3xl font-semibold mb-6">Select backend</h2>

        <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <button v-for="b in availableBackends" :key="b.value" type="button" :disabled="loadingConfig"
            @click="chooseBackend(b.value)" class="w-full text-left rounded-2xl border border-default bg-accent p-6 transition
                   hover:-translate-y-0.5 hover:shadow-lg
                   disabled:opacity-60 disabled:cursor-not-allowed" :class="selectedBackend === b.value
                    ? 'ring-2 ring-primary ring-offset-2 ring-offset-accent'
                    : 'ring-0'">
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
        </div>

        <!-- MinIO alias selector -->
        <div v-if="selectedBackend === 'minio'" class="mb-6 w-9/12 mx-auto">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-xl font-semibold">MinIO alias</h3>

            <button type="button" class="btn btn-secondary" @click="loadMinioAliasesIfNeeded"
              :disabled="loadingMinioAliases">
              <ArrowPathIcon class="size-icon mr-1" />
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
            <select v-model="selectedMinioAlias" class="w-full rounded-lg border border-default bg-accent px-4 py-3">
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

        <RustfsInstanceSelector
          v-if="selectedBackend === 'rustfs'"
          :loading="loadingRustfsAliases"
          :alias-error="rustfsAliasError"
          :aliases="rustfsAliases"
          :selected-alias="selectedRustfsAlias"
          :show-manual-form="showRustfsManualForm"
          :needs-manual-creds="rustfsNeedsManualCreds"
          :manual-host="rustfsManualHost"
          :manual-port="rustfsManualPort"
          :manual-access-key="rustfsManualAccessKey"
          :manual-secret-key="rustfsManualSecretKey"
          :manual-region="rustfsManualRegion"
          :applying-manual="applyingRustfsManual"
          :manual-saved="rustfsManualSaved"
          :deleting-manual="deletingRustfsManual"
          :selected-is-manual="selectedRustfsIsManual"
          :selected-manual-access-key="selectedRustfsManualAccessKey"
          @update:selected-alias="selectedRustfsAlias = $event"
          @update:show-manual-form="showRustfsManualForm = $event"
          @update:manual-host="rustfsManualHost = $event"
          @update:manual-port="rustfsManualPort = $event"
          @update:manual-access-key="rustfsManualAccessKey = $event"
          @update:manual-secret-key="rustfsManualSecretKey = $event"
          @update:manual-region="rustfsManualRegion = $event"
          @refresh="loadRustfsAliasesIfNeeded"
          @open-manual-editor="openRustfsManualEditor"
          @apply-manual-connection="applyRustfsManualConnection"
          @remove-manual-connection="removeRustfsManualConnection"
        />

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
              <button type="button" class="btn btn-secondary w-full text-6xl" @click="chooseView('buckets')"
                :disabled="(selectedBackend === 'minio' && !selectedMinioAlias) || (selectedBackend === 'rustfs' && !selectedRustfsAlias)">
                Bucket Management
              </button>
            </template>
          </CardContainer>

          <CardContainer class="col-span-1 bg-accent border-default rounded-md">
            <div>
              <AccIcon class="w-[50%] mx-auto icon-default" />
            </div>

            <template #footer>
              <button type="button" class="btn btn-secondary w-full text-6xl" @click="chooseView('users')"
                :disabled="(selectedBackend === 'minio' && !selectedMinioAlias) || (selectedBackend === 'rustfs' && !selectedRustfsAlias)">
                Access Management
              </button>
            </template>
          </CardContainer>
        </div>
      </div>

      <!-- STEP 3: actual views -->
      <div v-else-if="step === 3 && selectedBackend && selectedView">
        <S3BucketsView v-if="selectedView === 'buckets'" :backend="selectedBackend" :cephGateway="selectedGateway"
          :minioAlias="selectedMinioAlias" :showBackButton="true"
          @backToViewSelection="() => { step = 2; selectedView = null; }" />

        <template v-else-if="selectedView === 'users'">
          <UsersView v-if="selectedBackend === 'ceph'" :showBackButton="true"
            @backToViewSelection="() => { step = 2; selectedView = null; }" />

          <div v-else-if="selectedBackend === 'minio'">
            <MinioAccessManagement :minioAlias="selectedMinioAlias"
              @backToViewSelection="() => { step = 2; selectedView = null; }" />
          </div>

          <div v-else-if="selectedBackend === 'rustfs'">
            <MinioAccessManagement :minioAlias="selectedRustfsAlias" backendLabel="RustFS"
              @backToViewSelection="() => { step = 2; selectedView = null; }" />
          </div>

          <GarageKeysPage v-else-if="selectedBackend === 'garage'"
            @backToViewSelection="() => { step = 2; selectedView = null; }" />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import S3BucketsView from "./bucketManagement/S3BucketsView.vue";
import RustfsInstanceSelector from "./RustfsInstanceSelector.vue";
import { isCephRgwHealthy, listRgwGateways } from "../api/cephCliAdapter";
import {
  isMinioAvailable,
  listMinioAliasCandidates,
  setAccessAdminCli,
  setMinioAlias,
} from "../api/minioCliAdapter";
import {
  deleteRustfsManualConnection,
  isRustfsAvailable,
  listRustfsManualConnections,
  listRustfsAliasCandidates,
  setRustfsAlias,
  setRustfsManualConnection,
  type RustfsManualSavedConnection,
} from "../api/rustfsCliAdapter";
import { isGarageHealthy } from "../api/garageCliAdapter";
import UsersView from "./accessManagementViews/CephRgw/UsersView.vue";
import MinioAccessManagement from "./accessManagementViews/s3/S3AccessManagement.vue";
import GarageKeysPage from "./accessManagementViews/GarageHq/GarageKeysPage.vue";
import { CardContainer } from "@45drives/houston-common-ui";
import { ArchiveBoxIcon, ArrowPathIcon } from "@heroicons/vue/20/solid";
import AccIcon from "../images/AccIcon.vue";
import type { RgwGateway } from "../types/types";
import { pushNotification, Notification } from "@45drives/houston-common-ui";

type Backend = "minio" | "rustfs" | "ceph" | "garage";
type View = "buckets" | "users";

type MinioAliasOption = {
  alias: string;
  url?: string;
  source?: string;
  manual?: boolean;
  accessKey?: string;
};

const loadingConfig = ref(false);

const isMinioAvailableFlag = ref(false);
const isRustfsAvailableFlag = ref(false);
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
const loadingRustfsAliases = ref(false);
const rustfsAliases = ref<MinioAliasOption[]>([]);
const selectedRustfsAlias = ref<string>("");
const rustfsAliasError = ref<string | null>(null);
const rustfsManualHost = ref("localhost");
const rustfsManualPort = ref("9200");
const rustfsManualAccessKey = ref("");
const rustfsManualSecretKey = ref("");
const rustfsManualRegion = ref("us-east-1");
const applyingRustfsManual = ref(false);
const showRustfsManualForm = ref(false);
const deletingRustfsManual = ref<string | null>(null);
const rustfsManualSaved = ref<RustfsManualSavedConnection[]>([]);
const rustfsNeedsManualCreds = computed(() => {
  const msg = String(rustfsAliasError.value ?? "").toLowerCase();
  return (
    msg.includes("credential") ||
    msg.includes("invalidaccesskeyid") ||
    msg.includes("signaturedoesnotmatch") ||
    msg.includes("auth")
  );
});
const selectedRustfsCandidate = computed(() =>
  rustfsAliases.value.find((a) => a.alias === selectedRustfsAlias.value)
);
const selectedRustfsManualSaved = computed(() =>
  rustfsManualSaved.value.find((a) => a.alias === selectedRustfsAlias.value)
);
const selectedRustfsIsManual = computed(() => Boolean(selectedRustfsCandidate.value?.manual));
const selectedRustfsManualAccessKey = computed(() => {
  const selected = selectedRustfsCandidate.value;
  if (!selected?.manual) return "";
  return String(selected.accessKey ?? "").trim() || String(selected.alias).split(":", 1)[0] || "";
});

const availableBackends = computed(() => {
  const list: { value: Backend; label: string }[] = [];
  if (isMinioAvailableFlag.value) list.push({ value: "minio", label: "MinIO" });
  if (isRustfsAvailableFlag.value) list.push({ value: "rustfs", label: "RustFS" });
  if (isCephAvailable.value) list.push({ value: "ceph", label: "Ceph RGW" });
  if (isGarageAvailable.value) list.push({ value: "garage", label: "Garage" });

  console.log("list ",list)
  return list;
});

async function detectBackends() {
  loadingConfig.value = true;

  try {
    const results = await Promise.allSettled([
      isMinioAvailable(),
      isRustfsAvailable(),
      isGarageHealthy(),
      isCephRgwHealthy(),
    ]);

    const [minioRes, rustfsRes, garageRes, cephRes] = results;

    isMinioAvailableFlag.value =
      minioRes.status === "fulfilled" ? !!minioRes.value : false;

    isRustfsAvailableFlag.value = rustfsRes.status === "fulfilled" ? !!rustfsRes.value : false;
    if (!isRustfsAvailableFlag.value) {
      try {
        const candidates = await listRustfsAliasCandidates();
        if (candidates.length > 0) {
          isRustfsAvailableFlag.value = true;
          rustfsAliasError.value = "RustFS detected, but credentials may be missing or invalid. Enter them manually below.";
        }
      } catch {
        // ignore
      }
    }

    isGarageAvailable.value =
      garageRes.status === "fulfilled" ? !!garageRes.value : false;

    isCephAvailable.value =
      cephRes.status === "fulfilled" ? !!cephRes.value : false;


    selectedBackend.value = null;
    selectedView.value = null;
    step.value = 1;
    await autoSelectSingleBackendIfAny();

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
      selectedMinioAlias.value = minioAliases.value[0]!.alias;
    }
  } catch (e: any) {
    pushNotification(new Notification(`Failed to list MinIO aliases`, e?.message, "error"));

    // minioAliasError.value = e?.message ?? "Failed to list MinIO aliases";
  } finally {
    loadingMinioAliases.value = false;
  }
}

async function loadRustfsAliasesIfNeeded() {
  if (selectedBackend.value !== "rustfs") return;

  loadingRustfsAliases.value = true;
  rustfsAliasError.value = null;
  rustfsAliases.value = [];
  selectedRustfsAlias.value = "";

  try {
    const list = await listRustfsAliasCandidates();
    rustfsManualSaved.value = await listRustfsManualConnections();

    const normalized: MinioAliasOption[] = (list as any[])
      .map((x) => {
        if (typeof x === "string") return { alias: x };
        return {
          alias: String(x.alias ?? "").trim(),
          url: typeof x.url === "string" ? x.url : undefined,
          source: typeof x.source === "string" ? x.source : undefined,
          manual: Boolean(x.manual),
          accessKey: typeof x.accessKey === "string" ? x.accessKey : undefined,
        };
      })
      .filter((x) => !String(x.alias ?? "").startsWith("fallback:"))
      .filter((x) => x.alias);

    rustfsAliases.value = normalized;

    if (rustfsAliases.value.length === 1) {
      selectedRustfsAlias.value = rustfsAliases.value[0]!.alias;
      showRustfsManualForm.value = false;
      rustfsAliasError.value = null;
    } else if (rustfsAliases.value.length === 0) {
      selectedRustfsAlias.value = "";
      showRustfsManualForm.value = true;
      rustfsAliasError.value = "No auto-detected RustFS instance with usable credentials. Use manual setup.";
    }
  } catch (e: any) {
    rustfsAliases.value = [];
    selectedRustfsAlias.value = "";
    showRustfsManualForm.value = true;
    rustfsManualSaved.value = await listRustfsManualConnections().catch(() => []);
    console.warn("RustFS instance listing failed:", e);
  } finally {
    loadingRustfsAliases.value = false;
  }
}

async function applyRustfsManualConnection() {
  const host = rustfsManualHost.value.trim();
  const port = rustfsManualPort.value.trim();
  const accessKey = rustfsManualAccessKey.value.trim();
  const secretKey = rustfsManualSecretKey.value.trim();
  const region = rustfsManualRegion.value.trim() || "us-east-1";

  if (!host || !port || !accessKey || !secretKey) {
    pushNotification(new Notification("Manual RustFS config", "Host, port, access key and secret key are required.", "error"));
    return;
  }

  const selected = selectedRustfsCandidate.value;
  const protectedNonManual = rustfsAliases.value.find((entry) => {
    const keyPrefix =
      String(entry.accessKey ?? "").trim() || String(entry.alias).split(":", 1)[0] || "";
    return !entry.manual && keyPrefix === accessKey;
  });
  if (protectedNonManual) {
    pushNotification(
      new Notification(
        "Manual RustFS config",
        `Access key "${accessKey}" belongs to an auto-detected entry and cannot be updated from Manual Setup.`,
        "error"
      )
    );
    return;
  }

  const endpoint = `http://${host}:${port}`;
  if (
    selected &&
    !selected.manual &&
    String(selected.accessKey ?? "").trim() === accessKey &&
    String(selected.url ?? "").trim() === endpoint
  ) {
    pushNotification(
      new Notification(
        "Manual RustFS config",
        "Auto-detected entries cannot be updated. Use a different access key or endpoint to add a manual entry.",
        "error"
      )
    );
    return;
  }

  applyingRustfsManual.value = true;
  try {
    await setRustfsManualConnection({ host, port, accessKey, secretKey, region });
    await loadRustfsAliasesIfNeeded();
    const picked =
      rustfsAliases.value.find((a) => String(a.url ?? "").trim() === endpoint)?.alias ??
      rustfsAliases.value.find((a) => String(a.alias ?? "").includes(`:${endpoint}`))?.alias ??
      "";
    if (picked) {
      selectedRustfsAlias.value = picked;
      setRustfsAlias(picked);
    }
    isRustfsAvailableFlag.value = true;
    rustfsAliasError.value = null;
    pushNotification(new Notification("RustFS", `Manual connection set to ${host}:${port}`, "success", 2000));
  } catch (e: any) {
    pushNotification(new Notification("Manual RustFS config failed", e?.message ?? "Unable to apply manual connection.", "error"));
  } finally {
    applyingRustfsManual.value = false;
  }
}

async function removeRustfsManualConnection(accessKey: string) {
  const key = String(accessKey ?? "").trim();
  if (!key) return;
  deletingRustfsManual.value = key;
  try {
    await deleteRustfsManualConnection(key);
    await loadRustfsAliasesIfNeeded();
    if (selectedRustfsAlias.value.startsWith(`${key}:`)) {
      selectedRustfsAlias.value = rustfsAliases.value[0]?.alias ?? "";
      if (selectedRustfsAlias.value) setRustfsAlias(selectedRustfsAlias.value);
    }
    pushNotification(new Notification("RustFS", `Removed saved credential "${key}"`, "success", 2000));
  } catch (e: any) {
    pushNotification(new Notification("RustFS", e?.message ?? "Failed to remove saved credential", "error"));
  } finally {
    deletingRustfsManual.value = null;
  }
}

function openRustfsManualEditor() {
  showRustfsManualForm.value = true;
  syncRustfsManualFormFromSelection();
}

async function removeSelectedRustfsManualConnection() {
  const key = selectedRustfsManualAccessKey.value;
  if (!key) return;
  await removeRustfsManualConnection(key);
}

function syncRustfsManualFormFromSelection() {
  const selected = selectedRustfsCandidate.value;
  if (!selected) return;

  const endpoint = String(selected.url ?? "").trim();
  if (endpoint) {
    try {
      const u = new URL(endpoint);
      rustfsManualHost.value = u.hostname || rustfsManualHost.value;
      if (u.port) rustfsManualPort.value = u.port;
    } catch {
      // ignore parse errors
    }
  }

  const keyPrefix = String(selected.accessKey ?? "").trim() || String(selected.alias).split(":", 1)[0] || "";
  if (keyPrefix) rustfsManualAccessKey.value = keyPrefix;

  if (selected.manual) {
    const saved = selectedRustfsManualSaved.value;
    if (saved?.secretKey) rustfsManualSecretKey.value = saved.secretKey;
    if (saved?.region) rustfsManualRegion.value = saved.region;
  }
}

async function chooseBackend(backend: Backend) {
  selectedBackend.value = backend;
  selectedView.value = null;

  if (backend === "rustfs") {
    setAccessAdminCli("rc");
  } else if (backend === "minio") {
    setAccessAdminCli("mc");
  }

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
  if (backend !== "rustfs") {
    rustfsAliases.value = [];
    selectedRustfsAlias.value = "";
    rustfsAliasError.value = null;
  }

  if (backend === "ceph") {
    await loadGatewaysIfNeeded();
  }

  if (backend === "minio") {
    await loadMinioAliasesIfNeeded();
  }
  if (backend === "rustfs") {
    await loadRustfsAliasesIfNeeded();
  }

  step.value = 2;
}

function chooseView(view: View) {
  if (selectedBackend.value === "rustfs" && view === "users") {
    const alias = selectedRustfsAlias.value.trim();
    if (!alias) return;
    // Reuse MinIO access-management command layer against selected RustFS alias.
    setMinioAlias(alias);
  }
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
  rustfsAliases.value = [];
  selectedRustfsAlias.value = "";
  rustfsAliasError.value = null;
}
async function autoSelectSingleBackendIfAny() {
  const list = availableBackends.value;
  const [only] = list;
  if (!only || list.length !== 1) return;

  await chooseBackend(only.value);
}
watch(
  () => selectedMinioAlias.value,
  (alias) => {
    if (alias && alias.trim()) {
      setMinioAlias(alias.trim());
    }
  }
);
watch(
  () => selectedRustfsAlias.value,
  (alias) => {
    if (alias && alias.trim()) {
      const selected = alias.trim();
      setRustfsAlias(selected);
      if (selectedBackend.value === "rustfs") {
        setMinioAlias(selected);
      }
      syncRustfsManualFormFromSelection();
    }
  }
);

onMounted(() => {
  setAccessAdminCli("mc");
  detectBackends();
});
</script>
