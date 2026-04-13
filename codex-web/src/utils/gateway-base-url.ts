export const gatewayBaseUrlStorageKey = "quota-gateway-base-url";
export const proxiedGatewayBaseUrl = "/gateway-api";

const legacyGatewayBaseUrl = "http://127.0.0.1:4000";

export const normalizeGatewayBaseUrl = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return proxiedGatewayBaseUrl;
  }

  return trimmed.endsWith("/") && trimmed.length > 1 ? trimmed.slice(0, -1) : trimmed;
};

export const getStoredGatewayBaseUrl = () => {
  const stored = window.localStorage.getItem(gatewayBaseUrlStorageKey);
  if (!stored || stored === legacyGatewayBaseUrl) {
    return proxiedGatewayBaseUrl;
  }

  return normalizeGatewayBaseUrl(stored);
};

export const saveGatewayBaseUrl = (value: string) => {
  const normalized = normalizeGatewayBaseUrl(value);
  window.localStorage.setItem(gatewayBaseUrlStorageKey, normalized);
  return normalized;
};
