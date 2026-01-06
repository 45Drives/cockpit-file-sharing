<script setup lang="ts">
import { LockClosedIcon, EyeIcon, EyeSlashIcon } from "@heroicons/vue/20/solid";

const [model, modifiers] = defineModel<string | number>({ default: "" });

const props = defineProps<{
  placeholder?: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: "input", value: string): void;
  (e: "change", value: string): void;
}>();

const showPassword = defineModel<boolean>("showPassword", { default: false, required: false });

const onInput = ({ target }: Event) => {
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  if (modifiers.lazy) {
    return;
  }
  model.value = target.value;
  emit("input", model.value);
};

const onChange = ({ target }: Event) => {
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  model.value = target.value;
  emit("change", model.value);
};
</script>

<template>
  <div class="relative">
    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
      <LockClosedIcon class="size-icon icon-default" aria-hidden="true" />
    </div>
    <input
      :type="showPassword ? 'text' : 'password'"
      class="w-full input-textlike block !px-10"
      :placeholder="placeholder"
      :disabled="disabled"
      :value="model"
      @input="onInput"
      @change="onChange"
      autocomplete="off"
    />
    <div @click="showPassword = !showPassword" class="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer">
      <EyeIcon v-if="showPassword" class="size-icon icon-default" aria-hidden="true" />
      <EyeSlashIcon v-else class="size-icon icon-default" aria-hidden="true" />
    </div>
  </div>
</template>
