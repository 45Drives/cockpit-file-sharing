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
  
        <S3BucketsView
          v-if="selectedBackend"
          :backend="selectedBackend"
        />
      </div>
    </div>
</template>
  
  <script setup lang="ts">
  import { ref, computed, onMounted } from "vue";
  import S3BucketsView from "./views/S3BucketsView.vue"; // adjust path if needed
  import { isCephRgwHealthy } from "../api/s3CliAdapter";
  import { isMinioHealthy } from "../api/minioCliAdapter";
  import { isGarageHealthy } from "../api/garageCliAdapter";
  
  const loadingConfig = ref(false);
  const isMinioAvailable = ref(false);
  const isCephAvailable = ref(false);
  const isGarageAvailable = ref(false);
  const selectedBackend = ref<"minio" | "ceph" | "garage" | null>(null);
  
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
        isCephRgwHealthy(),
        isGarageHealthy(),
      ]);
  
      isMinioAvailable.value = minioOk;
      isCephAvailable.value = cephOk;
      isGarageAvailable.value = garageOk;
  
      // Only auto-pick if nothing is already selected,
      // and choose in priority order MinIO -> Ceph -> Garage.
      if (!selectedBackend.value) {
        if (minioOk) {
          selectedBackend.value = "minio";
        } 
        else if (cephOk) {
           selectedBackend.value = "ceph";
         }
         else if (garageOk) {
          selectedBackend.value = "garage";
        } else {
          selectedBackend.value = null;
        }
      }
    } finally {
      loadingConfig.value = false;
    }
  }
  
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
  .error {
    color: #b00020;
  }
  </style>
  