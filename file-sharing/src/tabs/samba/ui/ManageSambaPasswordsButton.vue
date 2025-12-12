<template>
  <DisclosureController v-slot="{ show, setShow }">
    <button class="btn btn-primary" @click="() => setShow(true)">Manage Samba Passwords</button>
    <Modal :show="show">
      <div class="overflow-hidden">
        <SambaPasswordUserList class="h-full">
          <template #close-button>
            <button class="btn btn-primary" @click="() => setShow(false)">Close</button>
          </template>
        </SambaPasswordUserList>
      </div>
    </Modal>
  </DisclosureController>
  <div></div>
</template>

<script setup lang="ts">
import { Modal, DisclosureController } from "@45drives/houston-common-ui";
import SambaPasswordUserList from "@/tabs/samba/ui/SambaPasswordUserList.vue";

</script>
