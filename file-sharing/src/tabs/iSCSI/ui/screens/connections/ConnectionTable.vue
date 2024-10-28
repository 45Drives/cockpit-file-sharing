<template>
    <CardContainer>
        <div class="card">
            <div class="sm:shadow sm:rounded-lg sm:border sm:border-default overflow-hidden">
                <Table headerText="Connections" emptyText="No connections." noScroll
                    class="!border-none !shadow-none">
                    <template #thead>
                        <tr>
                            <th scope="col">Connection ID</th>
                            <th scope="col">IP Address</th>
                        </tr>
                    </template>
                    <template #tbody>
                        <ConnectionEntry v-for="(connection, index) in session.connections" :key="index" :connection="connection" />
                    </template>
                </Table>
            </div>
        </div>
    </CardContainer>
</template>

<script setup lang="ts">
    import { CardContainer, Table } from "@45drives/houston-common-ui";
    import type { Session } from "../../../types/Session";
    import ConnectionEntry from "./ConnectionEntry.vue";

    const props = defineProps<{session: Session}>();
    
</script>