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
    confirm,
    type SelectMenuOption,
} from "@45drives/houston-common-ui";
import { getServer, KeyValueSyntax } from '@45drives/houston-common-lib';
import { BooleanKeyValueSuite } from '@/tabs/samba/ui/BooleanKeyValueSuite'; // TODO: move to common-ui
import { getSambaManager } from '@/tabs/samba/samba-manager';
import Table from '@/tabs/samba/ui/Table.vue';
import { PlusIcon } from "@heroicons/vue/20/solid";
import ShareTableRow from '@/tabs/samba/ui/ShareTableRow.vue';
import ShareConfigView from '@/tabs/samba/ui/ShareConfigView.vue';
import { okAsync, errAsync } from "neverthrow";

const _ = cockpit.gettext;

const sambaManager = getSambaManager();

const showNewShareEditor = ref(false);

const shares = ref<SambaShareConfig[]>([]);

const shareNames = computed(() => shares.value.map((s) => s.name));

const shareSortPredicate = (a: SambaShareConfig, b: SambaShareConfig) =>
    a.name.localeCompare(b.name, undefined, { caseFirst: 'false' });

const loadShares = () =>
    sambaManager
        .andThen(sm => sm.getShares())
        .map(s => {
            s.sort(shareSortPredicate);
            shares.value = s;
        });

const reloadShare = (shareName: string) =>
    sambaManager
        .andThen(sm => sm.getShare(shareName))
        .map(newShare => {
            // if share is in array
            if (shares.value.some((s) => s.name === newShare.name)) {
                // patch new share config into array
                shares.value = shares.value.map(oldShare =>
                    oldShare.name === newShare.name
                        ? newShare
                        : oldShare);
            } else {
                // append share to array
                shares.value = [newShare, ...shares.value].sort(shareSortPredicate);
            }
        });

const addShare = (share: SambaShareConfig) =>
    sambaManager
        .andThen((sm) => sm.addShare(share))
        .andThen(() => reloadShare(share.name))
        .map(() => reportSuccess(`${_("Successfully added share")} ${share.name}`));

const editShare = (share: SambaShareConfig) =>
    sambaManager
        .andThen((sm) => sm.editShare(share))
        .andThen(() => reloadShare(share.name))
        .map(() => reportSuccess(`${_("Successfully updated share")} ${share.name}`));

const removeShare = (share: SambaShareConfig) =>
    confirm({
        header: _("Permanently delete") + ` ${share.name}?`,
        body: _("This cannot be undone."),
        dangerous: true
    }).andThen((confirmed) =>
        confirmed
            ? sambaManager
                .andThen((sm) => sm.removeShare(share))
                .map(() =>
                    shares.value = shares.value.filter((s) => s.name !== share.name))
                .map(() => reportSuccess(`${_("Successfully removed share")} ${share.name}`))
            : okAsync(null));

const actions = wrapActions({
    loadShares,
    addShare,
    editShare,
    removeShare,
});

onMounted(actions.loadShares);

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
                @apply="(s) => actions.addShare(s).map(() => { showNewShareEditor = false; })"
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
                    <th scope="col">{{ _("Name") }}</th>
                    <th scope="col">{{ _("Path") }}</th>
                    <th
                        scope="col"
                        class="flex flex-row justify-end"
                    >
                        <span class="sr-only">{{ _("Edit/Delete") }}</span>
                        <button @click="showNewShareEditor = !showNewShareEditor">
                            <span class="sr-only">{{ _("Add new share") }}</span>
                            <PlusIcon class="size-icon icon-default" />
                        </button>
                    </th>
                </tr>
            </template>
            <template #tbody>
                <template
                    v-for="share in shares"
                    :key="share.name"
                >
                    <ShareTableRow
                        :share="share"
                        :allShareNames="shareNames"
                        @editShare="(s, callback) =>
                            actions.editShare(s).map(() => callback())"
                        @removeShare="(s) => actions.removeShare(s)"
                    />
                </template>
            </template>
        </Table>
    </CardContainer>
</template>
