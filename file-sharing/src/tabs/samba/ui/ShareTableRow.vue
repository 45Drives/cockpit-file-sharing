<script setup lang="ts">
import { computed, defineProps, onMounted, ref, watch, watchEffect } from "vue";
import type { SambaShareConfig } from '@/tabs/samba/data-types';
import { PencilSquareIcon, TrashIcon } from "@heroicons/vue/20/solid";
import { Disclosure, wrapActions } from '@45drives/houston-common-ui';
import ShareConfigView from '@/tabs/samba/ui/ShareConfigView.vue';
import { getSambaManager } from '@/tabs/samba/samba-manager';

const props = defineProps<{
    shareName: string;
    allShareNames: string[];
}>();

const emit = defineEmits<{
    (e: 'editedShare', value: SambaShareConfig): void;
    (e: 'removedShare', value: SambaShareConfig): void;
}>();

const shareName = computed(() => props.shareName);

const showEditor = ref(false);

const sambaManager = getSambaManager();

const sharePath = ref<string>("");

const loadSharePath = () =>
    sambaManager
        .andThen(sm => sm.getShareProperty(shareName.value, "path"))
        .map(p => sharePath.value = p);

const actions = wrapActions({
    loadSharePath,
});

onMounted(actions.loadSharePath);

</script>

<template>
    <tr>
        <td>{{ shareName }}</td>
        <td class="text-muted">{{ sharePath }}</td>
        <td class="button-group-row justify-end">
            <button @click="showEditor = !showEditor">
                <span class="sr-only">Edit</span>
                <PencilSquareIcon class="size-icon icon-default" />
            </button>
            <button @click="">
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
                    :shareName="shareName"
                    :allShareNames="allShareNames"
                    class="!shadow-none px-4 sm:px-6 py-5"
                    @cancel="showEditor = false"
                    @editedShare="(share) => { showEditor = false; emit('editedShare', share)}"
                />
            </Disclosure>
        </td>
    </tr>
</template>
