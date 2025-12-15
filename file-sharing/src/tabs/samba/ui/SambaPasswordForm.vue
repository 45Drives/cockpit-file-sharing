<script setup lang="ts">
import { watch, ref, computed, onBeforeMount } from "vue";
import type { LocalUser } from "@45drives/houston-common-lib";
import { ValidationResultView, CardContainer } from "@45drives/houston-common-ui";
import { CheckIcon, XMarkIcon } from '@heroicons/vue/20/solid';

import PasswordInputField from "./PasswordInputField.vue";

const emit = defineEmits<{
  (e: "apply", password: string): void;
  (e: "cancel"): void;
}>();

const props = defineProps<{
  smbpasswdIsSet: boolean;
  user: LocalUser;
}>();

const password1 = ref("");
const password2 = ref("");
const showPasswords = ref(false);
const warnNotSatisfied = ref(false);

type PasswordRequirement = {
  label: string;
  check: (password: string) => boolean;
};

const passwordsMatch = computed(() => password1.value === password2.value);

const requirements: PasswordRequirement[] = [
  {
    label: "Lowercase letter",
    check: (p) => /[a-z]/.test(p),
  },
  {
    label: "Uppercase letter",
    check: (p) => /[A-Z]/.test(p),
  },
  {
    label: "Number",
    check: (p) => /[0-9]/.test(p),
  },
  {
    label: "Special character",
    check: (p) => /\W/.test(p),
  },
  {
    label: "8 characters long",
    check: (p) => p.length >= 8,
  },
];

const requirementsSatisfied = computed(() => requirements.every((r) => r.check(password1.value)));
watch(requirementsSatisfied, () => {
  warnNotSatisfied.value = false;
});

const clearInputFields = () => {
  password1.value = "";
  password2.value = "";
  showPasswords.value = false;
  warnNotSatisfied.value = false;
};

const onApply = () => {
  if (!passwordsMatch.value) {
    return;
  }
  if (requirementsSatisfied.value) {
    emit("apply", password1.value);
    return;
  }
  if (!warnNotSatisfied.value) {
    warnNotSatisfied.value = true;
  } else {
    emit("apply", password1.value);
  }
};

onBeforeMount(() => clearInputFields());
</script>

<template>
  <CardContainer>
    <template #header>
      {{ smbpasswdIsSet ? "Change" : "Set" }} Samba Password for {{ user.login }}
    </template>
    <div class="space-y-content">
      <PasswordInputField
        v-model="password1"
        v-model:show-password="showPasswords"
        placeholder="Type New Password"
      />
      <PasswordInputField
        v-model="password2"
        v-model:show-password="showPasswords"
        placeholder="Repeat Password"
      />
      <div class="flex flex-col items-start">
        <div>The password should satisfy the following requirements:</div>
        <div class="inline-flex flex-col items-stretch">
          <div v-for="requirement in requirements" class="flex flex-row text-sm items-center">
            <span class="grow">{{ requirement.label }}</span>
            <CheckIcon v-if="requirement.check(password1)" class="size-icon-sm ml-2 icon-success" />
            <XMarkIcon v-else class="size-icon-sm ml-2 icon-error" />
          </div>
        </div>
      </div>
      <ValidationResultView v-if="!passwordsMatch" type="error" message="Passwords do not match." />
      <ValidationResultView
        v-if="warnNotSatisfied"
        type="warning"
        message="Password does not satisfy all strength requirements. Click apply again to proceed anyway."
      />
    </div>
    <template #footer>
      <div class="button-group-row justify-end">
        <button class="btn btn-secondary" @click="() => emit('cancel')">Cancel</button>
        <button class="btn btn-primary" @click="() => onApply()" :disabled="!passwordsMatch">
          Apply
        </button>
      </div>
    </template>
  </CardContainer>
</template>
