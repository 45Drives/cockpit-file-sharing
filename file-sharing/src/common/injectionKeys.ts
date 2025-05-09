import { type InjectionKey, type Ref } from "vue";
import { getServerCluster } from "@45drives/houston-common-lib";

export const serverClusterInjectionKey = Symbol() as InjectionKey<
  ReturnType<typeof getServerCluster>
>;
export const cephClientNameInjectionKey = Symbol() as InjectionKey<Ref<`client.${string}`>>;
