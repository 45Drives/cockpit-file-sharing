import Prompt from "./Prompt.vue";
import { h, ref, render } from "vue";
import { CancelledByUser } from "@45drives/houston-common-lib";
import { ResultAsync } from "neverthrow";

export interface PromptProps<
  InputType extends "radio" | "checkbox",
  TChoices extends Record<string, unknown>,
> {
  headerText: string;
  bodyText?: string;
  cancelable?: boolean;
  cancelButtonText?: string;
  submitButtonText?: string;
  type: InputType;
  choices: TChoices;
}

type PromptReturnType<
  InputType extends "radio" | "checkbox",
  TChoices extends Record<string, unknown>,
> = InputType extends "radio" ? TChoices[keyof TChoices] : TChoices[keyof TChoices][];

let pending: Promise<any> = Promise.resolve();

export const prompt = async <
  InputType extends "radio" | "checkbox",
  TChoices extends Record<string, unknown>,
>(
  props: PromptProps<InputType, TChoices>
): Promise<PromptReturnType<InputType, TChoices>> => {
  await pending;
  let resolvePending: () => void;
  pending = new Promise<void>((resolve) => {
    resolvePending = resolve;
  })
  return await new Promise<PromptReturnType<InputType, TChoices>>((resolve, reject) => {
    const container = document.createElement("div");
    (document.getElementById("app") ?? document.body).appendChild(container);
    const vnode = h(Prompt, {
      ...props,
      onSubmit: resolve,
      onCancel: reject,
      onGone: () => {
        render(null, container);
        container.parentElement?.removeChild(container);
        resolvePending();
      },
    } as any);
    render(vnode, container);
  });
};

export const promptResult = <
  InputType extends "radio" | "checkbox",
  TChoices extends Record<string, unknown>,
>(
  props: PromptProps<InputType, TChoices>
) => {
  return ResultAsync.fromPromise(prompt(props), (e) => e as CancelledByUser);
};
