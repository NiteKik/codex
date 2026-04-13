import type { AuthConfig } from "../types.js";

const hopByHopHeaders = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

export const buildAuthHeaders = (auth: AuthConfig) => {
  if (auth.mode === "bearer" && auth.token) {
    return { authorization: `Bearer ${auth.token}` };
  }

  if (auth.mode === "static-headers" && auth.headers) {
    return Object.fromEntries(
      Object.entries(auth.headers).map(([key, value]) => [key.toLowerCase(), value]),
    );
  }

  return {};
};

export const mergeProxyHeaders = (
  requestHeaders: Headers | Record<string, unknown>,
  authHeaders: Record<string, string>,
) => {
  const headers = new Headers();

  Object.entries(requestHeaders).forEach(([key, value]) => {
    if (hopByHopHeaders.has(key.toLowerCase()) || value === undefined) {
      return;
    }

    headers.set(key, String(value));
  });

  Object.entries(authHeaders).forEach(([key, value]) => headers.set(key, value));
  return headers;
};

export const copyResponseHeaders = (
  source: Headers,
  target: { header: (key: string, value: string) => void },
) => {
  source.forEach((value, key) => {
    if (!hopByHopHeaders.has(key.toLowerCase())) {
      target.header(key, value);
    }
  });
};
