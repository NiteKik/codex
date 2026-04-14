/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEV_HOST?: string;
  readonly VITE_DEV_PORT?: string;
  readonly VITE_PREVIEW_HOST?: string;
  readonly VITE_GATEWAY_PROXY_PATH?: string;
  readonly VITE_GATEWAY_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
