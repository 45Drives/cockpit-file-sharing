import type { SambaManagerBase } from "@45drives/houston-common-lib";
import { type InjectionKey } from "vue";

export const sambaManagerInjectionKey = Symbol() as InjectionKey<SambaManagerBase>;
