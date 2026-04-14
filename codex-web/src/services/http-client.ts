const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");
const trimLeadingSlash = (value: string) => value.replace(/^\/+/, "");
const defaultRequestTimeoutMs = 15_000;

type RequestJsonInit = RequestInit & {
  timeoutMs?: number;
};

const joinBaseUrlAndPath = (baseUrl: string, path: string) => {
  if (!path) {
    return baseUrl;
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  if (!baseUrl) {
    return path;
  }

  const normalizedBase = trimTrailingSlash(baseUrl);
  const normalizedPath = trimLeadingSlash(path);

  if (!normalizedBase) {
    return `/${normalizedPath}`;
  }

  if (!normalizedPath) {
    return normalizedBase;
  }

  return `${normalizedBase}/${normalizedPath}`;
};

const safeParseJson = (rawText: string) => {
  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return rawText;
  }
};

const extractErrorMessage = (
  payload: unknown,
  response: Response,
  fallback: string,
) => {
  if (payload && typeof payload === "object" && "message" in payload) {
    return String((payload as { message: unknown }).message);
  }

  return `${response.status} ${response.statusText || fallback}`;
};

const isAbortError = (error: unknown) => {
  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }

  if (error && typeof error === "object" && "name" in error) {
    return (error as { name?: unknown }).name === "AbortError";
  }

  return false;
};

export const requestJson = async <T>(
  baseUrl: string,
  path: string,
  init: RequestJsonInit = {},
): Promise<T> => {
  const { timeoutMs = defaultRequestTimeoutMs, signal: externalSignal, ...requestInit } = init;
  const controller = new AbortController();

  const onExternalAbort = () => {
    controller.abort();
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  const timeoutId =
    timeoutMs > 0 ? window.setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetch(joinBaseUrlAndPath(baseUrl, path), {
      ...requestInit,
      signal: controller.signal,
    });
    const rawText = await response.text();
    const payload = safeParseJson(rawText);

    if (!response.ok) {
      throw new Error(extractErrorMessage(payload, response, "Request failed"));
    }

    return payload as T;
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error("请求超时或已取消，请稍后重试。");
    }

    throw error;
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }

    if (externalSignal) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  }
};
