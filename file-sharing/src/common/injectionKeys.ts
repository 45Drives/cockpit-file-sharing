import { type InjectionKey } from "vue";
import { getClusterScope } from "@/common/getClusterScope";

export const clusterScopeInjectionKey = Symbol() as InjectionKey<ReturnType<typeof getClusterScope>>;
