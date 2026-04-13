const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const findStringByKeys = (
  value: unknown,
  keys: Set<string>,
  depth = 0,
): string | null => {
  if (depth > 6 || value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringByKeys(item, keys, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const [key, current] of Object.entries(record)) {
      if (
        keys.has(key) &&
        typeof current === "string" &&
        current.trim().length > 0
      ) {
        return current.trim();
      }
    }

    for (const current of Object.values(record)) {
      const found = findStringByKeys(current, keys, depth + 1);
      if (found) {
        return found;
      }
    }
  }

  return null;
};

export type SessionParseResult =
  | {
      ok: true;
      email: string;
    }
  | {
      ok: false;
      message: string;
    };

export type SessionAuthParseResult =
  | {
      ok: true;
      email: string;
      accessToken: string;
    }
  | {
      ok: false;
      message: string;
    };

export function parseSessionPayload(payload: string): SessionParseResult {
  const trimmedPayload = payload.trim();

  if (!trimmedPayload) {
    return {
      ok: false,
      message: "请先粘贴完整的 Session 响应",
    };
  }

  try {
    const parsedPayload = JSON.parse(trimmedPayload) as {
      user?: {
        email?: unknown;
      };
    };
    const email = parsedPayload.user?.email;

    if (typeof email === "string" && EMAIL_PATTERN.test(email)) {
      return {
        ok: true,
        email,
      };
    }
  } catch {
    const fallbackEmail = trimmedPayload.match(EMAIL_PATTERN)?.[0];

    if (fallbackEmail) {
      return {
        ok: true,
        email: fallbackEmail,
      };
    }

    return {
      ok: false,
      message: "Session 格式无效，请粘贴 /api/auth/session 返回的完整 JSON",
    };
  }

  const fallbackEmail = trimmedPayload.match(EMAIL_PATTERN)?.[0];
  if (fallbackEmail) {
    return {
      ok: true,
      email: fallbackEmail,
    };
  }

  return {
    ok: false,
    message: "未识别到邮箱，请确认粘贴的是 /api/auth/session 的完整 JSON",
  };
}

export function parseSessionAuthPayload(
  payload: string,
): SessionAuthParseResult {
  const trimmedPayload = payload.trim();
  if (!trimmedPayload) {
    return {
      ok: false,
      message: "请先粘贴完整的 Session 响应",
    };
  }

  try {
    const parsedPayload = JSON.parse(trimmedPayload) as unknown;
    const email = findStringByKeys(parsedPayload, new Set(["email"]));
    const accessToken = findStringByKeys(parsedPayload, new Set(["accessToken", "access_token"]));

    if (!email || !EMAIL_PATTERN.test(email)) {
      return {
        ok: false,
        message: "未识别到邮箱，请确认粘贴的是 /api/auth/session 的完整 JSON",
      };
    }

    if (!accessToken) {
      return {
        ok: false,
        message: "未识别到 access token，请重新复制 /api/auth/session 的完整 JSON。",
      };
    }

    return {
      ok: true,
      email,
      accessToken,
    };
  } catch {
    return {
      ok: false,
      message: "Session 格式无效，请粘贴 /api/auth/session 返回的完整 JSON",
    };
  }
}
