<template>
    <tr>
        <td>{{ connection.connectionID }}</td>
        <td>{{ connection.ipAddress }}</td>
    </tr>
</template>

<script setup lang="ts">
	import type { Connection } from "../../../types/Connection";

	const props = defineProps<{connection: Connection}>();
</script>