export const nowIso = () => new Date().toISOString();

export const addMs = (input: string | Date, ms: number) =>
  new Date(new Date(input).getTime() + ms).toISOString();

export const isExpired = (value: string | null, now = new Date()) =>
  value !== null && new Date(value).getTime() <= now.getTime();

export const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
