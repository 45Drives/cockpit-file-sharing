<script setup lang="ts">
import { ExclamationCircleIcon, ExclamationTriangleIcon } from "@heroicons/vue/20/solid";

const props = defineProps<{
    message: string,
    type: "error" | "warning";
}>();

</script>

<template>
    <div class="feedback-group">
        <ExclamationCircleIcon
            v-if="type === 'error'"
            class="size-icon icon-error"
        />
        <ExclamationTriangleIcon
            v-else
            class="size-icon icon-warning"
        />
        <span
            class="text-feedback"
            :class="type === 'error' ? 'text-error' : 'text-warning'"
        >{{ message }}</span>
    </div>
</template>

<!-- <style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style> -->
