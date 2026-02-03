<!-- MinioPolicyCreateModal.vue -->
<template>
  <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
    <div class="bg-accent rounded-lg shadow-lg max-w-xl w-full mx-4">
      <!-- Header -->
      <div class="px-5 py-4 border-b border-default flex items-center justify-between">
        <h3 class="text-base font-semibold">
          Create MinIO policy
        </h3>
        <button class="px-2 py-1 text-xs rounded border border-default bg-secondary hover:bg-gray-100" @click="close"
          :disabled="loading">
          Close
        </button>
      </div>

      <!-- Body -->
      <div class="px-5 py-4 space-y-4 text-sm">
        <!-- Errors -->
        <div v-if="localError" class="text-xs text-red-600">
          {{ localError }}
        </div>
        <div v-else-if="errorMessage" class="text-xs text-red-600">
          {{ errorMessage }}
        </div>

        <!-- Name -->
        <div>
          <label class="block text-xs font-medium mb-1">
            Policy name
          </label>
          <input v-model.trim="name" type="text"
            class="w-full border border-default bg-default rounded px-2 py-1 text-sm"
            placeholder="e.g. backups-readwrite" />
          <p class="text-xs text-muted mt-1">
            This is the name MinIO will use for the policy (e.g. in
            <span class="font-mono">mc admin policy attach</span>.
          </p>
        </div>

        <!-- JSON editor -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-xs font-medium">
              Policy JSON
            </label>
            <div class="flex items-center space-x-2">
              <button type="button"
                class="px-2 py-1 text-sm rounded border border-default bg-primary hover:bg-gray-100"
                @click="insertTemplate">
                Insert bucket template
              </button>
              <button type="button"
                class="px-2 py-1 text-sm rounded border border-default bg-secondary hover:bg-gray-100"
                @click="formatJson">
                Format JSON
              </button>
            </div>
          </div>

          <textarea v-model="json"
            class="w-full border border-default bg-default rounded px-2 py-2 text-xs font-mono min-h-[220px]"
            placeholder='{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": ["s3:GetObject"],
        "Resource": ["arn:aws:s3:::your-bucket/*"]
      }
    ]
  }' />

          <p class="text-xs text-muted mt-1">
            Policy syntax is S3-compatible JSON. You can paste an existing policy or
            start from the template and adjust bucket name, actions, and resources.
          </p>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-5 py-3 border-t border-default flex justify-end space-x-2">
        <button class="px-3 py-1.5 text-xs rounded border border-default bg-secondary hover:bg-gray-100" @click="close"
          :disabled="loading">
          Cancel
        </button>
        <button
          class="px-3 py-1.5 text-xs rounded border border-green-600 bg-green-600 text-white hover:bg-green-700disabled:opacity-60"
          @click="submit" :disabled="loading">
          Create policy
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, watch } from "vue";

const props = defineProps<{
  modelValue: boolean;
  loading?: boolean;
  errorMessage?: string | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "submit", payload: { name: string; json: string }): void;
}>();

const name = ref("");
const json = ref("");
const localError = ref<string | null>(null);

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      name.value = "";
      json.value = "";
      localError.value = null;
    }
  }
);

function close() {
  emit("update:modelValue", false);
}

function insertTemplate() {
  if (json.value.trim()) {
    return;
  }

  const template = {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: [
          "s3:GetBucketLocation",
          "s3:ListBucket",
        ],
        Resource: ["arn:aws:s3:::your-bucket"],
      },
      {
        Effect: "Allow",
        Action: [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
        ],
        Resource: ["arn:aws:s3:::your-bucket/*"],
      },
    ],
  };

  json.value = JSON.stringify(template, null, 2);
}

function formatJson() {
  if (!json.value.trim()) {
    return;
  }

  try {
    const parsed = JSON.parse(json.value);
    json.value = JSON.stringify(parsed, null, 2);
    localError.value = null;
  } catch (e: any) {
    localError.value = "Invalid JSON: " + (e?.message || "Could not parse policy.");
  }
}

function submit() {
  localError.value = null;

  if (!name.value.trim()) {
    localError.value = "Policy name is required.";
    return;
  }

  if (!json.value.trim()) {
    localError.value = "Policy JSON is required.";
    return;
  }

  // Validate JSON before emitting
  try {
    JSON.parse(json.value);
  } catch (e: any) {
    localError.value = "Invalid JSON: " + (e?.message || "Could not parse policy.");
    return;
  }

  emit("submit", {
    name: name.value.trim(),
    json: json.value,
  });
}
</script>