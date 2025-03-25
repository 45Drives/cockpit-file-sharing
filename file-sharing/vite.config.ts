import { fileURLToPath, URL } from "node:url";

import { defineConfig, PluginOption } from "vite";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import VueDevTools from "vite-plugin-vue-devtools";

import manifest from "../manifest.json";

const getAppVersionDefine = () => {
  return `${manifest.version}-${manifest.build_number}${process.env.OS_PACKAGE_RELEASE ?? "built_from_source"}`;
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), vueJsx(), VueDevTools()] as PluginOption[],
  base: "./",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    dedupe: ["vue"],
  },
  build: {
    target: ["chrome87", "edge88", "firefox78", "safari14"],
    sourcemap: true,
  },
  define: {
    __APP_VERSION__: JSON.stringify(getAppVersionDefine()),
  },
});
