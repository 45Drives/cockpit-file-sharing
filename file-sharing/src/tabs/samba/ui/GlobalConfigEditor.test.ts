// @vitest-environment jsdom
import { beforeAll, expect, test, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { SambaGlobalConfig } from "@45drives/houston-common-lib";

vi.mock("@/tabs/samba/ui/ManageSambaPasswordsButton.vue", () => ({
  default: { template: "<span />" },
}));

beforeAll(() => {
  vi.stubGlobal("cockpit", { gettext: (message: string) => message });
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

test("Advanced edits apply on the first click and invalid or unchanged drafts do not", async () => {
  const { default: GlobalConfigEditor } = await import("./GlobalConfigEditor.vue");
  const editor = mount(GlobalConfigEditor, {
    props: { globalConf: SambaGlobalConfig.defaults() },
    global: {
      stubs: {
        CardContainer: {
          template: '<div><slot name="header"/><slot/><slot name="footer"/></div>',
        },
        Disclosure: { template: "<div><slot/></div>" },
        InputLabelWrapper: { template: "<div><slot/></div>" },
        ToggleSwitchGroup: { template: "<div><slot/></div>" },
        ToggleSwitch: { template: "<div><slot/></div>" },
        InputField: true,
        SelectMenu: true,
      },
    },
  });

  await flushPromises();
  const textarea = editor.get("textarea");
  const apply = () => editor.findAll("button").find((button) => button.text() === "Apply")!;

  (textarea.element as HTMLTextAreaElement).value = "security = ADS";
  await textarea.trigger("input");
  expect(apply().attributes("disabled")).toBeUndefined();

  (textarea.element as HTMLTextAreaElement).value = "invalid";
  await textarea.trigger("input");
  expect(apply().attributes("disabled")).toBeDefined();

  (textarea.element as HTMLTextAreaElement).value = "";
  await textarea.trigger("input");
  expect(apply().attributes("disabled")).toBeDefined();

  (textarea.element as HTMLTextAreaElement).value = "security = ADS";
  await textarea.trigger("input");
  await textarea.trigger("change");
  await apply().trigger("click");
  expect(editor.emitted("apply")?.[0]?.[0]).toMatchObject({
    advancedOptions: { security: "ADS" },
  });
});