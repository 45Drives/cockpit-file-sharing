<script lang="ts">
const _ = cockpit.gettext;
</script>

<script
  setup
  lang="ts"
  generic="InputType extends 'radio' | 'checkbox', T, TChoices extends { [key: string]: T }"
>
import { CancelledByUser } from "@45drives/houston-common-lib";
import { Modal, CardContainer } from "@45drives/houston-common-ui";
import { computed, ref } from "vue";

const props = withDefaults(
  defineProps<{
    headerText: string;
    bodyText?: string;
    cancelable?: boolean;
    cancelButtonText?: string;
    submitButtonText?: string;
    type: InputType;
    choices: TChoices;
  }>(),
  {
    bodyText: "",
    cancelable: true,
    cancelButtonText: _("Cancel"),
    submitButtonText: _("Apply"),
  }
);

const choiceList = computed(() => Object.entries(props.choices));

const model = props.type === "radio" ? ref<T | null>(null) : ref<T[]>([]);

defineEmits<{
  (e: "submit", value: InputType extends "radio" ? T : T[]): void;
  (e: "cancel", reason: CancelledByUser): void;
  (e: "gone"): void;
}>();

const show = ref(true);
</script>

<template>
  <Modal :show="show" class="z-20" @afterLeave="$emit('gone')">
    <CardContainer class="sm:min-w-96">
      <template #header>
        {{ headerText }}
      </template>
      <div class="space-y-content">
        <div v-if="bodyText">
          {{ bodyText }}
        </div>
        <div class="flex flex-col gap-content">
          <template v-for="[key, value] in choiceList" :key="key">
            <div class="space-x-2">
              <input :type="type" :id="key" :value="value" v-model="model" class="input-checkbox" />
              <label :for="key" class="text-label">{{ key }}</label>
            </div>
          </template>
        </div>
      </div>

      <template #footer>
        <div class="button-group-row justify-end grow">
          <button
            class="btn btn-secondary"
            @click="
              $emit('cancel', new CancelledByUser());
              show = false;
            "
            v-if="cancelable"
          >
            {{ cancelButtonText }}
          </button>
          <button
            class="btn btn-primary"
            @click="
              if (type !== 'radio' || model !== null) {
                $emit('submit', model as InputType extends 'radio' ? T : T[]);
                show = false;
              }
            "
            :disabled="type === 'radio' && model === null"
          >
            {{ submitButtonText }}
          </button>
        </div>
      </template>
    </CardContainer>
  </Modal>
</template>
