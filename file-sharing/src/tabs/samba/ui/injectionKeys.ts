import type { ProcessError, SambaManagerBase } from "@45drives/houston-common-lib";
import type { ResultAsync } from "neverthrow";
import { type InjectionKey } from "vue";

export const sambaManagerInjectionKey = Symbol() as InjectionKey<
  ResultAsync<SambaManagerBase, ProcessError>
>;
