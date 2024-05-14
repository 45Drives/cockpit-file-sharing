<script setup lang="ts">
import { InputField } from "@/common/ui";
import type { SambaGlobalConfig } from '@/tabs/samba/data-types';
import { ref, watch, computed, type UnwrapRef, toRaw } from 'vue';
import deepEqual from "deep-equal";
import { CardContainer } from "@45drives/houston-common-ui";

const props = defineProps<{
    globalConfig: SambaGlobalConfig;
}>();

const useTempObjectStaging = <T extends {}>(originalObject: T) => {
    const tempObject = ref(structuredClone(toRaw(originalObject)));
    watch(originalObject, (newObject) => {
        tempObject.value = structuredClone(toRaw(newObject)) as UnwrapRef<T>;
    }, { deep: true });

    const modified = computed<boolean>(() => 
        !deepEqual(tempObject.value, originalObject));

    return { tempObject, modified };
};

const { tempObject: tempGlobalConfig, modified } = useTempObjectStaging(props.globalConfig);

</script>

<template>
    <CardContainer>
        <template v-slot:header>
            Global
            <span v-if="modified">*</span>
        </template>

        <div class="space-y-content">
            <InputField
                label="Server Description"
                placeholder="Description of server"
                v-model="tempGlobalConfig.serverString"
            />
            <InputField
                label="Workgroup"
                placeholder="WORKGROUP"
                v-model="tempGlobalConfig.workgroup"
            />

        </div>
    </CardContainer>
</template>
