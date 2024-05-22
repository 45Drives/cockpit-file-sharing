<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import type { SambaShareConfig } from '@/tabs/samba/data-types';
import {
    CardContainer,
    Disclosure,
    SelectMenu,
    useTempObjectStaging,
    wrapActions,
    reportSuccess,
    type SelectMenuOption,
} from "@45drives/houston-common-ui";
import { getServer, KeyValueSyntax } from '@45drives/houston-common-lib';
import { BooleanKeyValueSuite } from '@/tabs/samba/ui/BooleanKeyValueSuite'; // TODO: move to common-ui
import { getSambaManager } from '@/tabs/samba/samba-manager';
import Table from '@/tabs/samba/ui/Table.vue';
import { PlusIcon } from "@heroicons/vue/20/solid";
import ShareTableRow from '@/tabs/samba/ui/ShareTableRow.vue';
import ShareConfigView from '@/tabs/samba/ui/ShareConfigView.vue';

const _ = cockpit.gettext;

const showNewShareEditor = ref(false);

const shareNames = ref<string[]>([]);

const sambaManager = getSambaManager();

const loadShareNames = () =>
    sambaManager
        .andThen(sm => sm.listShareNames())
        .map(loadedShareNames => shareNames.value = loadedShareNames);

const actions = wrapActions({
    loadShareNames
});

onMounted(actions.loadShareNames);

</script>

<template>
    <CardContainer noBodyPaddingOnMobile>
        <template v-slot:header>
            {{ _("Share Configuration") }}
        </template>

        <Disclosure
            noButton
            v-model:show="showNewShareEditor"
            v-slot="{ visible }"
        >
            <ShareConfigView
                v-if="visible"
                newShare
                :allShareNames="shareNames"
                @cancel="showNewShareEditor = false"
                @addedShare="() => { showNewShareEditor = false; actions.loadShareNames(); }"
                class="!shadow-none !divide-y-0 pb-5 pt-5 px-4 sm:!pt-0 sm:!px-0"
            />
        </Disclosure>

        <Table
            :emptyText="_('No shares. Click \'+\' to add one.')"
            noScroll
            class="sm:rounded-lg sm:shadow sm:border sm:border-default"
        >
            <template #thead>
                <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Path</th>
                    <th
                        scope="col"
                        class="flex flex-row justify-end"
                    >
                        <span class="sr-only">Edit/Delete</span>
                        <button @click="showNewShareEditor = !showNewShareEditor">
                            <PlusIcon class="size-icon icon-default" />
                        </button>
                    </th>
                </tr>
            </template>
            <template #tbody>
                <template
                    v-for="shareName in shareNames"
                    :key="shareName"
                >
                    <ShareTableRow
                        :shareName="shareName"
                        :allShareNames="shareNames"
                        @editedShare="actions.loadShareNames"
                        @removedShare="actions.loadShareNames"
                    />
                </template>
            </template>
        </Table>
    </CardContainer>
</template>
