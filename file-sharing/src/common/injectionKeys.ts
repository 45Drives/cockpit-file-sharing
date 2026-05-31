import { type ComputedRef, type InjectionKey, type Ref } from "vue";
import { getServerCluster } from "@45drives/houston-common-lib";

export const serverClusterInjectionKey = Symbol() as InjectionKey<
  ReturnType<typeof getServerCluster>
>;
export const cephClientNameInjectionKey = Symbol() as InjectionKey<Ref<`client.${string}`>>;

/**
 * Per-tab read-only flag. Each tab's TabMain provides this from its
 * corresponding user-setting (samba.readOnly / nfs.readOnly / iscsi.readOnly);
 * editor components inject it and gate write affordances. Provided as a
 * ComputedRef so toggling the setting in the modal propagates without a
 * remount. The default (false) lets components that aren't under a provider
 * — or that are independently mounted in tests — render in editable mode.
 */
export const readOnlyInjectionKey = Symbol() as InjectionKey<ComputedRef<boolean>>;
