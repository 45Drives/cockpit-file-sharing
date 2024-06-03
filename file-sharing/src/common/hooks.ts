import { onMounted, onUnmounted, ref } from "vue";
import { Result, ResultAsync, ok, err } from "neverthrow";

export type HookCallback = () => ResultAsync<void, Error> | void;

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

export const executeHookCallbacks = (hook: Hook) =>
  getHookCallbacks(hook).asyncAndThen((hooks) =>
    ResultAsync.combine(
      [...hooks.values()]
        .map((callback) => callback())
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
