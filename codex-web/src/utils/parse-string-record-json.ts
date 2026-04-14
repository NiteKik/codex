export const parseStringRecordJson = (
  payload: string,
  fieldLabel = "工作空间请求头",
) => {
  const trimmed = payload.trim();
  if (!trimmed) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`${fieldLabel}必须是 JSON 对象。`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${fieldLabel}必须是 JSON 对象。`);
  }

  const entries = Object.entries(parsed).map(([key, value]) => {
    if (typeof value !== "string") {
      throw new Error(`${fieldLabel} "${key}" 的值必须是字符串。`);
    }

    return [key, value] as const;
  });

  return entries.length > 0 ? Object.fromEntries(entries) : null;
};
