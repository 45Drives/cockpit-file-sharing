<template>
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
        <div class="bg-default rounded-lg shadow-xl max-w-lg w-full mx-4 overflow-hidden border border-default">
            <div class="px-5 py-4 border-b border-default flex items-center justify-between">
                <h3 class="text-base font-semibold">Key created</h3>
                <button type="button"
                    class="text-sm px-3 py-1.5 rounded btn-secondary hover:bg-accent disabled:opacity-60"
                    @click="onClose">
                    Close
                </button>
            </div>

            <div class="px-5 py-4 space-y-4 text-sm">
                <div class="rounded border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2">
                    Save the secret key now. It will not be shown again.
                </div>

                <div class="space-y-3">
                    <div>
                        <div class="text-default font-semibold mb-1">Key ID</div>
                        <div class="flex items-center gap-2">
                            <code
                                class="flex-1 block bg-accent border border-default rounded px-2 py-2 font-mono text-xs break-all">
                  {{ keyDetail?.id ?? "-" }}
                </code>
                            <button type="button"
                                class="shrink-0 px-2 py-1 rounded btn-secondary hover:bg-accent text-xs"
                                @click="copy(keyDetail?.id ?? '')" :disabled="!keyDetail?.id">
                                Copy
                            </button>
                        </div>
                    </div>

                    <div>
                        <div class="text-default font-semibold mb-1">Name</div>
                        <div class="bg-accent border border-default rounded px-2 py-2">
                            {{ keyDetail?.name ?? "-" }}
                        </div>
                    </div>

                    <div>
                        <div class="text-default font-semibold mb-1">Secret key</div>
                        <div class="flex items-center gap-2">
                            <code
                                class="flex-1 block bg-accent border border-default rounded px-2 py-2 font-mono text-xs break-all">
                  {{ keyDetail?.secretKey ?? "Unavailable" }}
                </code>
                            <button type="button"
                                class="shrink-0 px-2 py-1 rounded btn-secondary hover:bg-accent text-xs"
                                @click="copy(keyDetail?.secretKey ?? '')" :disabled="!keyDetail?.secretKey">
                                Copy
                            </button>
                        </div>
                    </div>
                </div>

                <div v-if="copied" class="text-xs text-emerald-700">
                    Copied to clipboard.
                </div>
            </div>

            <div class="px-5 py-3 border-t border-default flex justify-end">
                <button type="button"
                    class="px-3 py-1.5 text-sm rounded btn-secondary hover:bg-accent"
                    @click="onClose">
                    Done
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import type { GarageKeyDetail } from "@/tabs/s3Management/types/types";

const props = defineProps<{
    open: boolean;
    keyDetail: GarageKeyDetail | null;
}>();

const emit = defineEmits<{
    (e: "close"): void;
}>();

const copied = ref(false);
let copiedTimer: number | undefined;

watch(
    () => props.open,
    (v) => {
        if (v) copied.value = false;
    }
);

function onClose() {
    emit("close");
}

async function copy(text: string) {
    if (!text) return;
    try {
        await navigator.clipboard.writeText(text);
        copied.value = true;
        if (copiedTimer) window.clearTimeout(copiedTimer);
        copiedTimer = window.setTimeout(() => {
            copied.value = false;
        }, 1500);
    } catch {
        copied.value = false;
    }
}
</script>