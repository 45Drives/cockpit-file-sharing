// vite.config.ts
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "file:///home/jordankeough/cockpit-file-sharing/file-sharing/node_modules/vite/dist/node/index.js";
import vue from "file:///home/jordankeough/cockpit-file-sharing/file-sharing/node_modules/@vitejs/plugin-vue/dist/index.js";
import vueJsx from "file:///home/jordankeough/cockpit-file-sharing/node_modules/@vitejs/plugin-vue-jsx/dist/index.mjs";
import VueDevTools from "file:///home/jordankeough/cockpit-file-sharing/node_modules/vite-plugin-vue-devtools/dist/vite.mjs";

// ../manifest.json
var manifest_default = {
  __version: "45D-R2",
  name: "cockpit-file-sharing",
  title: "Cockpit File Sharing",
  prerelease: false,
  version: "4.2.8",
  buildVersion: "1",
  author: "Josh Boudreau <jboudreau@45drives.com>",
  url: "https://github.com/45Drives/cockpit-file-sharing",
  category: "utils",
  priority: "optional",
  licence: "GPL-3.0+",
  architecture: {
    deb: "all",
    el: "noarch"
  },
  description: {
    long: "A cockpit module to make file sharing with Samba and NFS easier.",
    short: "A cockpit module to make file sharing with Samba and NFS easier."
  },
  defaults: {
    urgency: "medium"
  },
  dependencies: {
    deb: {
      focal: [
        "cockpit-bridge",
        "coreutils",
        "attr",
        "findutils",
        "hostname",
        "iproute2",
        "libc-bin",
        "systemd",
        "nfs-kernel-server",
        "samba-common-bin"
      ]
    },
    el: {
      el8: [
        "cockpit-bridge",
        "coreutils",
        "attr",
        "findutils",
        "hostname",
        "iproute",
        "glibc-common",
        "systemd",
        "nfs-utils",
        "samba-common-tools"
      ]
    }
  },
  releases: [
    {
      image: "node-ubuntu-focal-builder",
      codeName: "focal",
      type: "deb"
    },
    {
      image: "node-rocky-el8-builder",
      codeName: "el8",
      type: "el"
    }
  ],
  changelog: {
    urgency: "medium",
    version: "4.2.8",
    buildVersion: "1",
    ignore: [],
    date: null,
    packager: "Josh Boudreau <jboudreau@45drives.com>",
    changes: []
  }
};

// vite.config.ts
var __vite_injected_original_import_meta_url = "file:///home/jordankeough/cockpit-file-sharing/file-sharing/vite.config.ts";
var getAppVersionDefine = () => {
  return `${manifest_default.version}-${manifest_default.buildVersion}${process.env.OS_PACKAGE_RELEASE ?? "built_from_source"}`;
};
var vite_config_default = defineConfig({
  plugins: [vue(), vueJsx(), VueDevTools()],
  base: "./",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", __vite_injected_original_import_meta_url))
    },
    dedupe: ["vue"]
  },
  build: {
    target: ["chrome87", "edge88", "firefox78", "safari14"],
    sourcemap: true
  },
  define: {
    __APP_VERSION__: JSON.stringify(getAppVersionDefine())
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiLCAiLi4vbWFuaWZlc3QuanNvbiJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9ob21lL2pvcmRhbmtlb3VnaC9jb2NrcGl0LWZpbGUtc2hhcmluZy9maWxlLXNoYXJpbmdcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9ob21lL2pvcmRhbmtlb3VnaC9jb2NrcGl0LWZpbGUtc2hhcmluZy9maWxlLXNoYXJpbmcvdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL2hvbWUvam9yZGFua2VvdWdoL2NvY2twaXQtZmlsZS1zaGFyaW5nL2ZpbGUtc2hhcmluZy92aXRlLmNvbmZpZy50c1wiO2ltcG9ydCB7IGZpbGVVUkxUb1BhdGgsIFVSTCB9IGZyb20gXCJub2RlOnVybFwiO1xuXG5pbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidml0ZVwiO1xuaW1wb3J0IHZ1ZSBmcm9tIFwiQHZpdGVqcy9wbHVnaW4tdnVlXCI7XG5pbXBvcnQgdnVlSnN4IGZyb20gXCJAdml0ZWpzL3BsdWdpbi12dWUtanN4XCI7XG5pbXBvcnQgVnVlRGV2VG9vbHMgZnJvbSBcInZpdGUtcGx1Z2luLXZ1ZS1kZXZ0b29sc1wiO1xuXG5pbXBvcnQgbWFuaWZlc3QgZnJvbSBcIi4uL21hbmlmZXN0Lmpzb25cIjtcblxuY29uc3QgZ2V0QXBwVmVyc2lvbkRlZmluZSA9ICgpID0+IHtcbiAgcmV0dXJuIGAke21hbmlmZXN0LnZlcnNpb259LSR7bWFuaWZlc3QuYnVpbGRWZXJzaW9ufSR7cHJvY2Vzcy5lbnYuT1NfUEFDS0FHRV9SRUxFQVNFID8/IFwiYnVpbHRfZnJvbV9zb3VyY2VcIn1gO1xufTtcblxuLy8gaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFt2dWUoKSwgdnVlSnN4KCksIFZ1ZURldlRvb2xzKCldLFxuICBiYXNlOiBcIi4vXCIsXG4gIHJlc29sdmU6IHtcbiAgICBhbGlhczoge1xuICAgICAgXCJAXCI6IGZpbGVVUkxUb1BhdGgobmV3IFVSTChcIi4vc3JjXCIsIGltcG9ydC5tZXRhLnVybCkpLFxuICAgIH0sXG4gICAgZGVkdXBlOiBbXCJ2dWVcIl0sXG4gIH0sXG4gIGJ1aWxkOiB7XG4gICAgdGFyZ2V0OiBbXCJjaHJvbWU4N1wiLCBcImVkZ2U4OFwiLCBcImZpcmVmb3g3OFwiLCBcInNhZmFyaTE0XCJdLFxuICAgIHNvdXJjZW1hcDogdHJ1ZSxcbiAgfSxcbiAgZGVmaW5lOiB7XG4gICAgX19BUFBfVkVSU0lPTl9fOiBKU09OLnN0cmluZ2lmeShnZXRBcHBWZXJzaW9uRGVmaW5lKCkpLFxuICB9LFxufSk7XG4iLCAie1xuICAgIFwiX192ZXJzaW9uXCI6IFwiNDVELVIyXCIsXG4gICAgXCJuYW1lXCI6IFwiY29ja3BpdC1maWxlLXNoYXJpbmdcIixcbiAgICBcInRpdGxlXCI6IFwiQ29ja3BpdCBGaWxlIFNoYXJpbmdcIixcbiAgICBcInByZXJlbGVhc2VcIjogZmFsc2UsXG4gICAgXCJ2ZXJzaW9uXCI6IFwiNC4yLjhcIixcbiAgICBcImJ1aWxkVmVyc2lvblwiOiBcIjFcIixcbiAgICBcImF1dGhvclwiOiBcIkpvc2ggQm91ZHJlYXUgPGpib3VkcmVhdUA0NWRyaXZlcy5jb20+XCIsXG4gICAgXCJ1cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vNDVEcml2ZXMvY29ja3BpdC1maWxlLXNoYXJpbmdcIixcbiAgICBcImNhdGVnb3J5XCI6IFwidXRpbHNcIixcbiAgICBcInByaW9yaXR5XCI6IFwib3B0aW9uYWxcIixcbiAgICBcImxpY2VuY2VcIjogXCJHUEwtMy4wK1wiLFxuICAgIFwiYXJjaGl0ZWN0dXJlXCI6IHtcbiAgICAgICAgXCJkZWJcIjogXCJhbGxcIixcbiAgICAgICAgXCJlbFwiOiBcIm5vYXJjaFwiXG4gICAgfSxcbiAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgXCJsb25nXCI6IFwiQSBjb2NrcGl0IG1vZHVsZSB0byBtYWtlIGZpbGUgc2hhcmluZyB3aXRoIFNhbWJhIGFuZCBORlMgZWFzaWVyLlwiLFxuICAgICAgICBcInNob3J0XCI6IFwiQSBjb2NrcGl0IG1vZHVsZSB0byBtYWtlIGZpbGUgc2hhcmluZyB3aXRoIFNhbWJhIGFuZCBORlMgZWFzaWVyLlwiXG4gICAgfSxcbiAgICBcImRlZmF1bHRzXCI6IHtcbiAgICAgICAgXCJ1cmdlbmN5XCI6IFwibWVkaXVtXCJcbiAgICB9LFxuICAgIFwiZGVwZW5kZW5jaWVzXCI6IHtcbiAgICAgICAgXCJkZWJcIjoge1xuICAgICAgICAgICAgXCJmb2NhbFwiOiBbXG4gICAgICAgICAgICAgICAgXCJjb2NrcGl0LWJyaWRnZVwiLFxuICAgICAgICAgICAgICAgIFwiY29yZXV0aWxzXCIsXG4gICAgICAgICAgICAgICAgXCJhdHRyXCIsXG4gICAgICAgICAgICAgICAgXCJmaW5kdXRpbHNcIixcbiAgICAgICAgICAgICAgICBcImhvc3RuYW1lXCIsXG4gICAgICAgICAgICAgICAgXCJpcHJvdXRlMlwiLFxuICAgICAgICAgICAgICAgIFwibGliYy1iaW5cIixcbiAgICAgICAgICAgICAgICBcInN5c3RlbWRcIixcbiAgICAgICAgICAgICAgICBcIm5mcy1rZXJuZWwtc2VydmVyXCIsXG4gICAgICAgICAgICAgICAgXCJzYW1iYS1jb21tb24tYmluXCJcbiAgICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJlbFwiOiB7XG4gICAgICAgICAgICBcImVsOFwiOiBbXG4gICAgICAgICAgICAgICAgXCJjb2NrcGl0LWJyaWRnZVwiLFxuICAgICAgICAgICAgICAgIFwiY29yZXV0aWxzXCIsXG4gICAgICAgICAgICAgICAgXCJhdHRyXCIsXG4gICAgICAgICAgICAgICAgXCJmaW5kdXRpbHNcIixcbiAgICAgICAgICAgICAgICBcImhvc3RuYW1lXCIsXG4gICAgICAgICAgICAgICAgXCJpcHJvdXRlXCIsXG4gICAgICAgICAgICAgICAgXCJnbGliYy1jb21tb25cIixcbiAgICAgICAgICAgICAgICBcInN5c3RlbWRcIixcbiAgICAgICAgICAgICAgICBcIm5mcy11dGlsc1wiLFxuICAgICAgICAgICAgICAgIFwic2FtYmEtY29tbW9uLXRvb2xzXCJcbiAgICAgICAgICAgIF1cbiAgICAgICAgfVxuICAgIH0sXG4gICAgXCJyZWxlYXNlc1wiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICAgIFwiaW1hZ2VcIjogXCJub2RlLXVidW50dS1mb2NhbC1idWlsZGVyXCIsXG4gICAgICAgICAgICBcImNvZGVOYW1lXCI6IFwiZm9jYWxcIixcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImRlYlwiXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICAgIFwiaW1hZ2VcIjogXCJub2RlLXJvY2t5LWVsOC1idWlsZGVyXCIsXG4gICAgICAgICAgICBcImNvZGVOYW1lXCI6IFwiZWw4XCIsXG4gICAgICAgICAgICBcInR5cGVcIjogXCJlbFwiXG4gICAgICAgIH1cbiAgICBdLFxuICAgIFwiY2hhbmdlbG9nXCI6IHtcbiAgICAgICAgXCJ1cmdlbmN5XCI6IFwibWVkaXVtXCIsXG4gICAgICAgIFwidmVyc2lvblwiOiBcIjQuMi44XCIsXG4gICAgICAgIFwiYnVpbGRWZXJzaW9uXCI6IFwiMVwiLFxuICAgICAgICBcImlnbm9yZVwiOiBbXSxcbiAgICAgICAgXCJkYXRlXCI6IG51bGwsXG4gICAgICAgIFwicGFja2FnZXJcIjogXCJKb3NoIEJvdWRyZWF1IDxqYm91ZHJlYXVANDVkcml2ZXMuY29tPlwiLFxuICAgICAgICBcImNoYW5nZXNcIjogW11cbiAgICB9XG59Il0sCiAgIm1hcHBpbmdzIjogIjtBQUE4VSxTQUFTLGVBQWUsV0FBVztBQUVqWCxTQUFTLG9CQUFvQjtBQUM3QixPQUFPLFNBQVM7QUFDaEIsT0FBTyxZQUFZO0FBQ25CLE9BQU8saUJBQWlCOzs7QUNMeEI7QUFBQSxFQUNJLFdBQWE7QUFBQSxFQUNiLE1BQVE7QUFBQSxFQUNSLE9BQVM7QUFBQSxFQUNULFlBQWM7QUFBQSxFQUNkLFNBQVc7QUFBQSxFQUNYLGNBQWdCO0FBQUEsRUFDaEIsUUFBVTtBQUFBLEVBQ1YsS0FBTztBQUFBLEVBQ1AsVUFBWTtBQUFBLEVBQ1osVUFBWTtBQUFBLEVBQ1osU0FBVztBQUFBLEVBQ1gsY0FBZ0I7QUFBQSxJQUNaLEtBQU87QUFBQSxJQUNQLElBQU07QUFBQSxFQUNWO0FBQUEsRUFDQSxhQUFlO0FBQUEsSUFDWCxNQUFRO0FBQUEsSUFDUixPQUFTO0FBQUEsRUFDYjtBQUFBLEVBQ0EsVUFBWTtBQUFBLElBQ1IsU0FBVztBQUFBLEVBQ2Y7QUFBQSxFQUNBLGNBQWdCO0FBQUEsSUFDWixLQUFPO0FBQUEsTUFDSCxPQUFTO0FBQUEsUUFDTDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0o7QUFBQSxJQUNKO0FBQUEsSUFDQSxJQUFNO0FBQUEsTUFDRixLQUFPO0FBQUEsUUFDSDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0o7QUFBQSxJQUNKO0FBQUEsRUFDSjtBQUFBLEVBQ0EsVUFBWTtBQUFBLElBQ1I7QUFBQSxNQUNJLE9BQVM7QUFBQSxNQUNULFVBQVk7QUFBQSxNQUNaLE1BQVE7QUFBQSxJQUNaO0FBQUEsSUFDQTtBQUFBLE1BQ0ksT0FBUztBQUFBLE1BQ1QsVUFBWTtBQUFBLE1BQ1osTUFBUTtBQUFBLElBQ1o7QUFBQSxFQUNKO0FBQUEsRUFDQSxXQUFhO0FBQUEsSUFDVCxTQUFXO0FBQUEsSUFDWCxTQUFXO0FBQUEsSUFDWCxjQUFnQjtBQUFBLElBQ2hCLFFBQVUsQ0FBQztBQUFBLElBQ1gsTUFBUTtBQUFBLElBQ1IsVUFBWTtBQUFBLElBQ1osU0FBVyxDQUFDO0FBQUEsRUFDaEI7QUFDSjs7O0FEMUVnTixJQUFNLDJDQUEyQztBQVNqUSxJQUFNLHNCQUFzQixNQUFNO0FBQ2hDLFNBQU8sR0FBRyxpQkFBUyxPQUFPLElBQUksaUJBQVMsWUFBWSxHQUFHLFFBQVEsSUFBSSxzQkFBc0IsbUJBQW1CO0FBQzdHO0FBR0EsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDLElBQUksR0FBRyxPQUFPLEdBQUcsWUFBWSxDQUFDO0FBQUEsRUFDeEMsTUFBTTtBQUFBLEVBQ04sU0FBUztBQUFBLElBQ1AsT0FBTztBQUFBLE1BQ0wsS0FBSyxjQUFjLElBQUksSUFBSSxTQUFTLHdDQUFlLENBQUM7QUFBQSxJQUN0RDtBQUFBLElBQ0EsUUFBUSxDQUFDLEtBQUs7QUFBQSxFQUNoQjtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ0wsUUFBUSxDQUFDLFlBQVksVUFBVSxhQUFhLFVBQVU7QUFBQSxJQUN0RCxXQUFXO0FBQUEsRUFDYjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ04saUJBQWlCLEtBQUssVUFBVSxvQkFBb0IsQ0FBQztBQUFBLEVBQ3ZEO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
