<script setup lang="ts">
import { defineProps, ref } from "vue";
import type { SambaShareConfig } from '@/tabs/samba/data-types';
import { PencilSquareIcon, TrashIcon } from "@heroicons/vue/20/solid";
import { Disclosure } from '@45drives/houston-common-ui';
import ShareConfigView from '@/tabs/samba/ui/ShareConfigView.vue';

const props = defineProps<{
    share: SambaShareConfig;
    allShareNames: string[];
}>();

const emit = defineEmits<{
    (e: 'editShare', value: SambaShareConfig, callback: () => void): void;
    (e: 'removeShare', value: SambaShareConfig): void;
}>();

const showEditor = ref(false);

</script>

<template>
    <tr>
        <td>{{ share.name }}</td>
        <td class="text-muted">{{ share.path }}</td>
        <td class="button-group-row justify-end">
            <button @click="showEditor = !showEditor">
                <span class="sr-only">Edit</span>
                <PencilSquareIcon class="size-icon icon-default" />
            </button>
            <button @click="emit('removeShare', share)">
                <span class="sr-only">Delete</span>
                <TrashIcon class="size-icon icon-danger" />
            </button>
        </td>
    </tr>
    <tr></tr> <!-- needed to match bg color -->
    <tr>
        <td
            colspan="100%"
            class="!p-0"
        >
            <Disclosure
                noButton
                v-model:show="showEditor"
                v-slot="{ visible }"
            >
                <ShareConfigView
                    v-if="visible"
                    :share="share"
                    :allShareNames="allShareNames"
                    class="!shadow-none px-4 sm:px-6 py-5"
                    @cancel="showEditor = false"
                    @apply="(share) => emit('editShare', share, () => { showEditor = false; })"
                />
            </Disclosure>
        </td>
    </tr>
</template>
