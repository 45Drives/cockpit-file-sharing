import { type InjectionKey, type Ref } from "vue";
import { getClusterScope } from "@/common/getClusterScope";

export const clusterScopeInjectionKey = Symbol() as InjectionKey<ReturnType<typeof getClusterScope>>;
export const cephClientNameInjectionKey = Symbol() as InjectionKey<Ref<string>>;
