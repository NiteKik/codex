import { describe, expect, test } from "vite-plus/test";
import { formatDateTime } from "./date-time.ts";

describe("formatDateTime", () => {
  test("returns empty text when value is null", () => {
    expect(formatDateTime(null, { emptyText: "empty" })).toBe("empty");
  });

  test("returns invalid text when value is invalid", () => {
    expect(formatDateTime("invalid-date", { invalidText: "invalid" })).toBe("invalid");
  });

  test("formats valid date", () => {
    const result = formatDateTime("2026-04-14T00:00:00.000Z", {
      format: {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      },
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result.includes("2026") || result.includes("26")).toBe(true);
  });
});
