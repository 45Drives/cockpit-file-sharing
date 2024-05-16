<script setup lang="ts">
import { defineModel } from "vue";
import { ChevronUpIcon } from '@heroicons/vue/20/solid';

const show = defineModel<boolean>("show", { default: false });

</script>

<template>
    <div class="flex flex-col">
        <button
            @click="show = !show"
            class="flex justify-between sm:justify-start"
        >
            <label class="text-label pr-4 grow-0">
                <slot name="label">Click to expand</slot>
            </label>
            <ChevronUpIcon :class="show && '-rotate-180 transform'" class="size-icon icon-default grow-0 transition-transform duration-200 ease-in-out" />
        </button>
        <transition
            enter-active-class="transition duration-200 ease-out"
            enter-from-class="transform scale-y-0 -translate-y-1/2"
            enter-to-class="transform scale-y-100 translate-y-0"
            leave-active-class="transition duration-200 ease-in"
            leave-from-class="transform scale-y-100 translate-y-0"
            leave-to-class="transform scale-y-0 -translate-y-1/2"
        >
            <div v-show="show">
                <slot />
            </div>
        </transition>
    </div>

</template>
