<script setup lang="ts">

import { ref, watch, defineModel } from "vue";
import { KeyValueSyntax } from "@45drives/houston-common-lib";
import { reportError } from '@45drives/houston-common-ui';

const parser = KeyValueSyntax({ indent: 0 });

const keyValueData = defineModel<Record<string, string>>({ required: true });

const textAreaContent = ref("");

const onKeyValueDataChanged = (newKeyValueData: Record<string, string>) =>
    parser.unapply(newKeyValueData)
        .map((newContent) => textAreaContent.value = newContent)
        .mapErr(reportError);

const onTextAreaContentChanged = (newContent: string) =>
    parser.apply(newContent)
        .map((newData) => keyValueData.value = newData)
        .mapErr(reportError);

watch(keyValueData, onKeyValueDataChanged, {immediate: true});

</script>

<template>
    <textarea
        name="global-advanced-settings"
        rows="4"
        v-model="textAreaContent"
        class="w-full input-textlike"
        placeholder="key = value"
        @change="onTextAreaContentChanged(textAreaContent)"
    ></textarea>
</template>
