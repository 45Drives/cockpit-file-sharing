import { onMounted, onUnmounted, ref } from "vue";
import { Result, ResultAsync, ok, err } from "neverthrow";
import { type SambaShareConfig } from "@/tabs/samba/data-types";
import { type NFSExport } from "@/tabs/nfs/data-types";
import { type Server } from "@45drives/houston-common-lib";

type Common<A, B> = {
  [P in keyof A & keyof B]: A[P] | B[P];
};

export type Share = Common<SambaShareConfig, NFSExport>;

export type HookCallback = (server: Server, share: Share) => ResultAsync<void, Error> | void;

export const Hooks = {
  BeforeAddShare: Symbol("BeforeAddShare"),
  AfterAddShare: Symbol("AfterAddShare"),
  BeforeEditShare: Symbol("BeforeEditShare"),
  AfterEditShare: Symbol("AfterEditShare"),
  BeforeRemoveShare: Symbol("BeforeRemoveShare"),
  AfterRemoveShare: Symbol("AfterRemoveShare"),
};

export type Hook = (typeof Hooks)[keyof typeof Hooks];

const hookCallbacks = new Map<Hook, Set<HookCallback>>(
  Object.entries(Hooks).map(([_, hook]) => [hook, new Set<HookCallback>()])
);

const getHookCallbacks = (hook: Hook) => {
  const callbacks = hookCallbacks.get(hook);
  return callbacks ? ok(callbacks) : err(new Error(`Hooks not in Map for ${String(hook)}`));
};

export const executeHookCallbacks = (hook: Hook, server: Server, share: Share) =>
  getHookCallbacks(hook).asyncAndThen((hooks) =>
    ResultAsync.combine(
      [...hooks.values()]
        .map((callback) => callback(server, share))
        .filter((result): result is ResultAsync<void, Error> => result instanceof ResultAsync)
    )
  );

export const registerHookCallback = (hook: Hook, callback: HookCallback) =>
  getHookCallbacks(hook).map((callbacks) => callbacks.add(callback));
export const unregisterHookCallback = (hook: Hook, callback: HookCallback) =>
  getHookCallbacks(hook).map((callbacks) => callbacks.delete(callback));

export const useHookCallback = (hook: Hook | Hook[], callback: HookCallback) => {
  const hooks = [hook].flat();
  for (const hook of hooks) {
    onMounted(() => registerHookCallback(hook, callback));
    onUnmounted(() => unregisterHookCallback(hook, callback));
  }
};
