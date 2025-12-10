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
        <h2>Select backend</h2>
        <div class="button-row">
          <button
            v-for="b in availableBackends"
            :key="b.value"
            type="button"
            class="primary-button"
            @click="chooseBackend(b.value)"
          >
            {{ b.label }}
          </button>
        </div>
      </div>

      <!-- STEP 2: choose view (after backend) -->
      <div v-else-if="step === 2 && selectedBackend">
        <div class="flex items-center justify-between mb-4">
    <h2>
      Backend:
      {{
        availableBackends.find((b) => b.value === selectedBackend)?.label
      }}
    </h2>
    <button type="button" class="primary-button" @click="goBackToBackendSelection">
      Back
    </button>
  </div>

        <!-- Ceph gateway selector (only when backend is ceph) -->
        <div v-if="selectedBackend === 'ceph'" class="gateway-block">
          <div v-if="loadingGateways">
            Detecting Ceph object gateways…
          </div>

          <div v-else-if="gatewayError" class="error">
            {{ gatewayError }}
          </div>

          <div v-else-if="gateways.length === 0" class="error">
            No Ceph gateways found for the selected cluster.
          </div>

          <div v-else-if="gateways.length === 1" class="backend-indicator">
            Using gateway
            {{ gatewayLabel(gateways[0]) }}
          </div>

          <div v-else class="backend-selector">
            <label>
              Gateway:
              <select v-model="selectedGatewayId">
                <option
                  v-for="g in gateways"
                  :key="g.id"
                  :value="g.id"
                >
                  {{ gatewayLabel(g) }}
                </option>
              </select>
            </label>
          </div>
        </div>

        <!-- view choice buttons -->
        <div class="grid grid-cols-2 gap-10 text-2xl w-9/12 mx-auto">

        <CardContainer class="col-span-1 bg-accent border-default rounded-md">
        <div>
          <ArchiveBoxIcon class="w-[50%] icon-default mx-auto"></ArchiveBoxIcon>
        </div>
          <template #footer>
            <button
            type="button"
            class="btn btn-secondary w-full h-20 text-6xl"
            @click="chooseView('buckets')"
          >
            Bucket Management
          </button>
          </template>
        </CardContainer>
        <CardContainer class="col-span-1 bg-accent border-default rounded-md">
        <div>
            <!-- <img :src="accountManagementIcon" alt="Account" class="w-[50%] mx-auto" /> -->
            <AccIcon class="w-[50%] mx-auto icon-default"></AccIcon>
          </div>
          <div>
          </div>
          <template #footer>
            <button 
            type="button" 
            class="btn btn-secondary w-full h-20 text-6xl" 
            @click="chooseView('users')"
          >
            Access Management
          </button>
          </template>
        </CardContainer>
        </div>
        <div class="button-row">


        </div>
      </div>

      <!-- STEP 3: actual views -->
      <div v-else-if="step === 3 && selectedBackend && selectedView">
        <!-- Buckets view -->
        <S3BucketsView
          v-if="selectedView === 'buckets'"
          :backend="selectedBackend"
          :cephGateway="selectedGateway"
          :showBackButton="true"
          @backToViewSelection="() => { step = 2; selectedView = null; }"
        />

        <!-- Users views vary by backend -->
        <template v-else-if="selectedView === 'users'">
          <!-- Ceph users -->
          <UsersView
            v-if="selectedBackend === 'ceph'"
            :showBackButton="true"
            @backToViewSelection="() => { step = 2; selectedView = null; }"
            />

          <!-- MinIO users / access -->
          <div v-else-if="selectedBackend === 'minio'">
            <MinioAccessManagement />
          </div>

          <!-- Garage keys / users -->
          <GarageKeysPage
            v-else-if="selectedBackend === 'garage'"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted } from "vue";
  import S3BucketsView from "./views/S3BucketsView.vue";
  import { isCephRgwHealthy, listRgwGateways } from "../api/s3CliAdapter";
  import { isMinioHealthy } from "../api/minioCliAdapter";
  import { isGarageHealthy } from "../api/garageCliAdapter";
  import MinioUsersTable from "./views/minio/MinioUsersTable.vue";
  import UsersView from "./views/CephRgw/UsersView.vue";
  import MinioAccessManagement from "./views/minio/MinioAccessManagement.vue";
  import GarageKeysPage from "./views/GarageHq/GarageKeysPage.vue";
  import { CardContainer } from "@45drives/houston-common-ui";
  import { ArchiveBoxIcon } from "@heroicons/vue/20/solid";
  import AccIcon from "../images/AccIcon.vue";

  const loadingConfig = ref(false);
  const isMinioAvailable = ref(false);
  const isCephAvailable = ref(false);
  const isGarageAvailable = ref(false);
  
  // step 1: backend selection
  // step 2: view selection (buckets vs users)
  // step 3: actual view
  const step = ref<1 | 2 | 3>(1);
  
  const selectedBackend = ref<"minio" | "ceph" | "garage" | null>(null);
  const selectedView = ref<"buckets" | "users" | null>(null);
  
  // ----- Ceph gateways -----
  type RgwGateway = {
    id: string;
    hostname: string;
    zonegroup: string;
    zone: string;
    endpoint: string;
    isDefault: boolean;
  };
  
  const gateways = ref<RgwGateway[]>([]);
  const loadingGateways = ref(false);
  const gatewayError = ref<string | null>(null);
  const selectedGatewayId = ref<string | null>(null);
  
  const selectedGateway = computed<RgwGateway | null>(() => {
    if (!selectedGatewayId.value) return null;
    return gateways.value.find((g) => g.id === selectedGatewayId.value) || null;
  });
  
  function gatewayLabel(g: RgwGateway): string {
    const base = `${g.hostname} (${g.zone}.${g.zonegroup})`;
    if (g.isDefault) {
      return `${base} [default @ ${g.endpoint}]`;
    }
    return `${base} @ ${g.endpoint}`;
  }
  
  // --------------------------
  
  const availableBackends = computed(() => {
    const list: { value: "minio" | "ceph" | "garage"; label: string }[] = [];
    if (isMinioAvailable.value) {
      list.push({ value: "minio", label: "MinIO" });
    }
    if (isCephAvailable.value) {
      list.push({ value: "ceph", label: "Ceph RGW" });
    }
    if (isGarageAvailable.value) {
      list.push({ value: "garage", label: "Garage" });
    }
    return list;
  });
  
  async function detectBackends() {
    loadingConfig.value = true;
  
    try {
      const [minioOk, garageOk, cephOk] = await Promise.all([
        isMinioHealthy(),
        isGarageHealthy(),
        isCephRgwHealthy(),
      ]);
  
      isMinioAvailable.value = minioOk;
      isCephAvailable.value = cephOk;
      isGarageAvailable.value = garageOk;
  
      // Do NOT auto-select backend here: user chooses in step 1
      selectedBackend.value = null;
      selectedView.value = null;
      step.value = 1;
    } finally {
      loadingConfig.value = false;
    }
  }
  
  // Load Ceph gateways when Ceph backend is chosen
  async function loadGatewaysIfNeeded() {
    if (selectedBackend.value !== "ceph") return;
    if (!isCephAvailable.value) return;
  
    loadingGateways.value = true;
    gatewayError.value = null;
  
    try {
      const list = await listRgwGateways();
      gateways.value = list;
      if (list.length === 0) {
        selectedGatewayId.value = null;
        return;
      }
  
      const defaultGw = list.find((g) => g.isDefault);
      selectedGatewayId.value = (defaultGw || list[0]).id;
    } catch (e: any) {
      gatewayError.value = e?.message ?? "Failed to list Ceph gateways";
      gateways.value = [];
      selectedGatewayId.value = null;
    } finally {
      loadingGateways.value = false;
    }
  }
  
  // User clicked a backend button
  async function chooseBackend(backend: "minio" | "ceph" | "garage") {
    selectedBackend.value = backend;
    selectedView.value = null;
  
    if (backend === "ceph") {
      await loadGatewaysIfNeeded();
    }
  
    // move to the view selection "page"
    step.value = 2;
  }
  
  // User clicked a view button
  function chooseView(view: "buckets" | "users") {
    selectedView.value = view;
    step.value = 3;
  }
  function goBackToBackendSelection() {
  step.value = 1;
  selectedBackend.value = null;
  selectedView.value = null;
  selectedGatewayId.value = null;
  gatewayError.value = null;
}

  onMounted(() => {
    detectBackends();
  });
  </script>
  