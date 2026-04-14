export type FormatDateTimeOptions = {
  locale?: string;
  emptyText?: string;
  invalidText?: string;
  format?: Intl.DateTimeFormatOptions;
};

const defaultFormat: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
};

export const formatDateTime = (
  value: string | null,
  options?: FormatDateTimeOptions,
) => {
  const locale = options?.locale ?? "zh-CN";
  const emptyText = options?.emptyText ?? "-";
  const invalidText = options?.invalidText ?? "时间未知";

  if (!value) {
    return emptyText;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return invalidText;
  }

  return new Intl.DateTimeFormat(locale, options?.format ?? defaultFormat).format(parsed);
};
