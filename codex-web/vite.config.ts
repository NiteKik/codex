import { defineConfig, loadEnv } from "vite-plus";
import vue from "@vitejs/plugin-vue";

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const devHost = env.VITE_DEV_HOST || "127.0.0.1";
  const previewHost = env.VITE_PREVIEW_HOST || devHost;
  const proxyPath = env.VITE_GATEWAY_PROXY_PATH || "/gateway-api";
  const proxyTarget = env.VITE_GATEWAY_PROXY_TARGET || "http://127.0.0.1:4000";

  const parsedPort = Number.parseInt(env.VITE_DEV_PORT || "", 10);
  const devPort = Number.isFinite(parsedPort) ? parsedPort : 5173;

  const proxyPathPattern = new RegExp(`^${escapeRegex(proxyPath)}`);

  return {
    plugins: [vue()],
    server: {
      host: devHost,
      port: devPort,
      proxy: {
        [proxyPath]: {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(proxyPathPattern, ""),
        },
      },
    },
    preview: {
      host: previewHost,
    },
    staged: {
      "*": "vp check --fix",
    },
    fmt: {},
    lint: { options: { typeAware: true, typeCheck: true } },
  };
});
