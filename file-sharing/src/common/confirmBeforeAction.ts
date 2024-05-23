import type { Action, ModalConfirm } from "@45drives/houston-common-ui";
import { ResultAsync, errAsync, okAsync } from "neverthrow";
import type { Ref } from "vue";

export const confirmBeforeAction = (
    action: Action<any, any, any>,
    modalConfirmRef: Ref<InstanceType<typeof ModalConfirm> | null>,
    confirmHeader: string,
    confirmBody: string
	): typeof action => {
		return (...args: Parameters<typeof action>): ReturnType<typeof action> | ResultAsync<null, never> => {
			if (modalConfirmRef.value === null) {
				return errAsync(new Error("modalConfirmRef is null!"));
			}
			return ResultAsync.fromSafePromise(
				modalConfirmRef.value.ask(confirmHeader, confirmBody, { confirmText: "Yes", cancelText: "No" })
			).andThen((confirmed) => {
				if (!confirmed) {
					return okAsync(null);
				}
				return action(...args);
			});
		};
	};
