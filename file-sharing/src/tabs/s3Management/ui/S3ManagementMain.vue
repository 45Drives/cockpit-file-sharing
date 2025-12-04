<template>
    <div class="page">
      <h1>Bucket Management</h1>
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
        <!-- Backend selector when 2+ backends are available -->
        <div class="backend-selector" v-if="availableBackends.length > 1">
          <label>
            Backend:
            <select v-model="selectedBackend">
              <option
                v-for="b in availableBackends"
                :key="b.value"
                :value="b.value"
              >
                {{ b.label }}
              </option>
            </select>
          </label>
        </div>
  
        <!-- Single-backend indicator -->
        <div class="backend-indicator" v-else>
          <span>
            Using
            {{ availableBackends[0]?.label }}
            backend
          </span>
        </div>
  
        <!-- Ceph gateway selector -->
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
  
        <!-- <S3BucketsView
          v-if="selectedBackend"
          :backend="selectedBackend"
          :cephGateway="selectedGateway"
        /> -->

        <!-- <UsersView></UsersView> -->
        <MinioAccessManagement></MinioAccessManagement>
      </div>
    </div>
</template>
  
  <script setup lang="ts">
  import { ref, computed, onMounted, watch } from "vue";
  import S3BucketsView from "./views/S3BucketsView.vue";
  import { isCephRgwHealthy, listRgwGateways } from "../api/s3CliAdapter";
  import { isMinioHealthy } from "../api/minioCliAdapter";
  import { isGarageHealthy } from "../api/garageCliAdapter";
  import MinioUsersTable from "./views/minio/MinioUsersTable.vue";
  import UsersView from "./views/CephRgw/UsersView.vue";
  import MinioAccessManagement from "./views/minio/MinioAccessManagement.vue";
  const loadingConfig = ref(false);
  const isMinioAvailable = ref(false);
  const isCephAvailable = ref(false);
  const isGarageAvailable = ref(false);
  const selectedBackend = ref<"minio" | "ceph" | "garage" | null>(null);

  
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
  
      if (!selectedBackend.value) {
        if (minioOk) {
          selectedBackend.value = "minio";
        } else if (cephOk) {
          selectedBackend.value = "ceph";
        } else if (garageOk) {
          selectedBackend.value = "garage";
        } else {
          selectedBackend.value = null;
        }
      }
    } finally {
      loadingConfig.value = false;
    }
  }
  
  // Load Ceph gateways whenever Ceph becomes the active backend
  async function loadGatewaysIfNeeded() {
    if (selectedBackend.value !== "ceph") return;
    if (!isCephAvailable.value) return;
  
    loadingGateways.value = true;
    gatewayError.value = null;
  
    try {
      const list = await listRgwGateways();
      gateways.value = list;
    console.log("gateways: ", gateways.value)
      if (list.length === 0) {
        selectedGatewayId.value = null;
        return;
      }
  
      // Prefer default gateway, otherwise first
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
  
  watch(
    () => selectedBackend.value,
    async (backend) => {
      if (backend === "ceph") {
        await loadGatewaysIfNeeded();
      }
    }
  );
  
  onMounted(() => {
    detectBackends();
  });
  </script>
  
  <style scoped>
  .page {
    padding: 16px;
  }
  .backend-selector {
    margin-bottom: 12px;
  }
  .backend-indicator {
    margin-bottom: 12px;
    font-style: italic;
  }
  .gateway-block {
    margin-bottom: 12px;
  }
  .error {
    color: #b00020;
  }
  </style>
  