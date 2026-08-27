import { afterEach, describe, expect, it, vi } from "vitest";
import { queryOpenCodeGoQuota } from "./opencode-go.js";

const originalFetch = globalThis.fetch;
const config = {
  workspaceId: "ws_123",
  authCookie: "super-secret-cookie",
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("queryOpenCodeGoQuota", () => {
  it("returns structured HTTP status without exposing the response body", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ message: "raw upstream details", trace: "private" }),
        { status: 401 },
      ),
    ) as typeof fetch;

    const result = await queryOpenCodeGoQuota(config);

    expect(result).toEqual({
      success: false,
      status: 401,
      error: "OpenCode Go dashboard request failed (401)",
    });
    expect(JSON.stringify(result)).not.toContain("raw upstream details");
  });

  it("never exposes the submitted cookie through network errors", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error(`request failed with ${config.authCookie}`)) as typeof fetch;

    const result = await queryOpenCodeGoQuota(config);

    expect(result).toEqual({
      success: false,
      error: "OpenCode Go dashboard request failed",
    });
    expect(JSON.stringify(result)).not.toContain(config.authCookie);
  });

  it.each([
    ["TimeoutError", "Request timed out"],
    ["AbortError", "Request cancelled"],
  ])("classifies %s safely", async (name, message) => {
    const error = new Error("internal transport detail");
    error.name = name;
    globalThis.fetch = vi.fn().mockRejectedValue(error) as typeof fetch;

    const result = await queryOpenCodeGoQuota(config);

    expect(result).toEqual({ success: false, error: message });
    expect(JSON.stringify(result)).not.toContain("internal transport detail");
  });

  it("preserves successful dashboard scraping", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        "rollingUsage:$R[1]={usagePercent:25,resetInSec:3600}",
        { status: 200 },
      ),
    ) as typeof fetch;

    const result = await queryOpenCodeGoQuota(config);

    expect(result).toMatchObject({
      success: true,
      rolling: {
        usagePercent: 25,
        resetInSec: 3600,
        percentRemaining: 75,
      },
    });
  });
});
