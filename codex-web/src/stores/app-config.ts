import { defineStore } from "pinia";
import {
  getStoredGatewayBaseUrl,
  normalizeGatewayBaseUrl,
  saveGatewayBaseUrl,
} from "../utils/gateway-base-url.ts";

type AppConfigState = {
  initialized: boolean;
  gatewayBaseUrl: string;
};

export const useAppConfigStore = defineStore("appConfig", {
  state: (): AppConfigState => ({
    initialized: false,
    gatewayBaseUrl: getStoredGatewayBaseUrl(),
  }),
  actions: {
    initialize() {
      if (this.initialized) {
        return;
      }

      this.gatewayBaseUrl = getStoredGatewayBaseUrl();
      this.initialized = true;
    },
    setGatewayBaseUrl(value: string) {
      const normalized = normalizeGatewayBaseUrl(value);
      this.gatewayBaseUrl = saveGatewayBaseUrl(normalized);
      return this.gatewayBaseUrl;
    },
  },
});
