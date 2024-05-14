<script setup lang="ts">
import { defineProps, defineModel, defineEmits, ref } from "vue";
import InputFeedback from "./InputFeedback.vue";

const props = defineProps<{
    label?: string;
    placeholder?: string;
    validator?: (value: string) => { type: "error" | "warning", message: string; } | undefined;
}>();

const model = defineModel<string>({ default: "" });

const emit = defineEmits<{
    (e: 'input', value: string): void,
    (e: 'change', value: string): void,
}>();

const feedback = ref<{ type: "error" | "warning", message: string; } | undefined>(undefined);

</script>

<template>
    <div>
        <label
            v-if="label"
            class="block text-label"
        >{{ label }}</label>
        <input
            type="text"
            name="label"
            class="w-full input-textlike"
            :placeholder="placeholder"
            v-model="model"
            @input="emit('input', model)"
            @change="{emit('change', model); feedback = validator?.(model)}"
        />
        <InputFeedback
            v-if="feedback"
            :type="feedback.type"
            :message="feedback.message"
        />
    </div>
</template>

<!-- <style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style> -->
