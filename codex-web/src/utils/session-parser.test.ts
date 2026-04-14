import { describe, expect, test } from "vite-plus/test";
import {
  parseSessionAuthPayload,
  parseSessionPayload,
} from "./session-parser.ts";

describe("session parser", () => {
  test("parseSessionPayload extracts email", () => {
    const payload = JSON.stringify({
      user: {
        email: "dev@example.com",
      },
    });

    expect(parseSessionPayload(payload)).toEqual({
      ok: true,
      email: "dev@example.com",
    });
  });

  test("parseSessionAuthPayload extracts token and workspace", () => {
    const payload = JSON.stringify({
      user: { email: "dev@example.com" },
      accessToken: "token-123",
      workspace: { id: "ws_1", name: "Team Alpha", type: "team" },
    });

    const result = parseSessionAuthPayload(payload);
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.accessToken).toBe("token-123");
      expect(result.workspace.id).toBe("ws_1");
      expect(result.workspace.kind).toBe("team");
    }
  });

  test("parseSessionAuthPayload returns error for invalid payload", () => {
    const result = parseSessionAuthPayload("{}");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message.length).toBeGreaterThan(0);
    }
  });
});
