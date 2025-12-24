<template>
  <DisclosureController v-slot="{ show: showSmbpasswdModal, setShow: setShowSmbpasswdModal }">
    <div class="button-group-row">
      <button class="btn btn-primary" @click="() => setShowSmbpasswdModal(true)" tabindex="0">
        {{ smbpasswdIsSet ? "Change" : "Set" }} Samba Password
      </button>
      <button class="btn btn-danger" @click="removeSmbpasswd" v-if="smbpasswdIsSet" tabindex="0">
        Remove Samba Password
      </button>
    </div>
    <Modal :show="showSmbpasswdModal">
      <SambaPasswordForm
        :user="user"
        :smbpasswd-is-set="smbpasswdIsSet"
        @cancel="() => setShowSmbpasswdModal(false)"
        @apply="(password) => setSmbpasswd(password).map(() => setShowSmbpasswdModal(false))"
      />
    </Modal>
  </DisclosureController>
</template>

<script setup lang="ts">
import { type LocalUser } from "@45drives/houston-common-lib";
import {
  computedResult,
  pushNotification,
  Notification,
  wrapAction,
  assertConfirm,
  Modal,
  DisclosureController,
} from "@45drives/houston-common-ui";
import { computed, inject } from "vue";
import { errAsync, okAsync } from "neverthrow";
import SambaPasswordForm from "@/tabs/samba/ui/SambaPasswordForm.vue";
import { sambaManagerInjectionKey } from "@/tabs/samba/ui/injectionKeys";

const props = defineProps<{ user: LocalUser }>();

const user = computed(() => props.user);

const sambaManager = inject(sambaManagerInjectionKey);

const [smbpasswdIsSet, checkSmbpasswdIsSet] = computedResult<boolean>(() => {
  if (!user.value?.login) {
    return okAsync(false);
  }
  return sambaManager?.andThen((sm) => sm.userHasPassword(user.value.login)) ?? okAsync(false);
}, false);

const setSmbpasswd = wrapAction((password: string) => {
  if (!user.value?.login) {
    return errAsync(new Error("No user to set smbpasswd for!"));
  }
  if (!sambaManager) {
    return errAsync(new Error("SambaManager not provided!"));
  }
  const login = user.value.login;
  return (
    sambaManager
      .map((sm) => sm.setUserPassword(login, password))
      .map(() => {
        checkSmbpasswdIsSet();
        pushNotification(
          new Notification(
            "Set Samba password",
            `Samba password for ${login} was set successfully.`,
            "success"
          )
        );
      })
      .mapErr((e) => {
        checkSmbpasswdIsSet();
        return e;
      }) ?? errAsync(new Error("SambaManager not provided!"))
  );
});

const removeSmbpasswd = wrapAction(() => {
  if (!user.value?.login) {
    return errAsync(new Error("No user to remove smbpasswd for!"));
  }
  const login = user.value.login;
  return assertConfirm({
    header: `Remove Samba password for ${login}?`,
    body: "They will no longer be able to access Samba shares.",
    dangerous: true,
  })
    .andThen(() => sambaManager ?? errAsync(new Error("SambaManager not provided!")))
    .andThen((sm) => sm.removeUserPassword(login))
    .map(() => {
      checkSmbpasswdIsSet();
      pushNotification(
        new Notification(
          "Removed Samba password",
          `Samba password for ${login} was removed successfully.`,
          "success"
        )
      );
    })
    .mapErr((e) => {
      checkSmbpasswdIsSet();
      return e;
    });
});
</script>
