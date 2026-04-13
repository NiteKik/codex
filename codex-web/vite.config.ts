import { defineConfig } from "vite-plus";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/gateway-api": {
        target: "http://127.0.0.1:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gateway-api/, ""),
      },
    },
  },
  preview: {
    host: "127.0.0.1",
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: {},
  lint: { options: { typeAware: true, typeCheck: true } },
});
