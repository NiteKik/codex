import { describe, expect, test } from "vite-plus/test";
import { parseStringRecordJson } from "./parse-string-record-json.ts";

describe("parseStringRecordJson", () => {
  test("returns null for empty payload", () => {
    expect(parseStringRecordJson("   ")).toBeNull();
  });

  test("parses valid string map", () => {
    expect(parseStringRecordJson('{"x-account":"ws_123"}')).toEqual({
      "x-account": "ws_123",
    });
  });

  test("throws for non-object payload", () => {
    expect(() => parseStringRecordJson("[]")).toThrow("必须是 JSON 对象");
  });

  test("throws for non-string value", () => {
    expect(() => parseStringRecordJson('{"x-account": 1}')).toThrow(
      "值必须是字符串",
    );
  });
});
