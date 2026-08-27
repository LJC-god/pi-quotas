import { describe, expect, it } from "vitest";
import type { QuotaSnapshot } from "./visibility.js";
import {
  renderUsageEntry,
  serializeUsageEntry,
  type UsageEntryData,
} from "./static-display.js";

const ANSI_PATTERN = new RegExp(`${String.fromCodePoint(27)}\\[[0-9;]*m`, "gu");

function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, "");
}

const theme = {
  fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
} as any;

describe("compact static usage display", () => {
  it("serializes dates and renders every quota window on one compact line", () => {
    const snapshots: QuotaSnapshot[] = [
      {
        provider: "openai-codex",
        result: {
          success: true,
          data: {
            provider: "openai-codex",
            windows: [
              {
                provider: "openai-codex",
                label: "7d",
                usedPercent: 13,
                resetsAt: new Date("2026-09-02T12:00:00Z"),
                windowSeconds: 7 * 24 * 60 * 60,
                usedValue: 13,
                limitValue: 100,
              },
              {
                provider: "openai-codex",
                label: "Spend cap",
                usedPercent: 0,
                resetsAt: new Date(0),
                windowSeconds: 0,
                usedValue: 0,
                limitValue: 1,
                limited: false,
              },
            ],
          },
        },
      },
    ];

    const data = serializeUsageEntry(snapshots, new Date("2026-08-27T12:00:00Z"));
    const provider = data.providers[0];
    expect(provider && "windows" in provider).toBe(true);
    if (!provider || !("windows" in provider)) throw new Error("Expected quota windows");
    expect(provider.windows[0]?.resetsAt).toBe("2026-09-02T12:00:00.000Z");

    const output = renderUsageEntry(data, theme, new Date("2026-08-27T12:00:00Z"));
    const plainLines = output.split("\n").map(stripAnsi);

    expect(plainLines).toHaveLength(4);
    expect(plainLines[0]).toContain("OpenAI Codex");
    expect(plainLines[1]).toMatch(/7d\s+[█░]{10}\s+13%\s+reset\s+[○◔◑◕●]\s+6d/);
    expect(plainLines[2]).toContain("Spend cap");
    expect(plainLines[2]).toContain("OK");
    expect(plainLines[3]).toMatch(/fetched \d{1,2}:\d{2}:\d{2}/);
    expect(output).not.toContain("r to refresh");
    expect(output).not.toContain("q/Esc");
    expect(output).not.toContain("─");
  });

  it("keeps count and currency details compact", () => {
    const data = serializeUsageEntry([
      {
        provider: "zai-coding-cn",
        result: {
          success: true,
          data: {
            provider: "zai-coding-cn",
            windows: [
              {
                provider: "zai-coding-cn",
                label: "Month (credits)",
                usedPercent: 43,
                resetsAt: new Date("2026-08-30T00:00:00Z"),
                windowSeconds: 30 * 24 * 60 * 60,
                usedValue: 4343,
                limitValue: 10000,
              },
              {
                provider: "zai-coding-cn",
                label: "Extra",
                usedPercent: 25,
                resetsAt: new Date(0),
                windowSeconds: 0,
                usedValue: 5,
                limitValue: 20,
                isCurrency: true,
              },
            ],
          },
        },
      },
    ], new Date("2026-08-27T12:00:00Z"));

    const output = stripAnsi(renderUsageEntry(data, theme, new Date("2026-08-27T12:00:00Z")));

    expect(output).toContain("43%  4,343/10,000");
    expect(output).toContain("25%  $5.00/$20.00");
  });

  it("renders provider errors in one line without exposing structured data", () => {
    const data = serializeUsageEntry([
      {
        provider: "xai",
        result: {
          success: false,
          error: { kind: "network", message: "usage unavailable" },
        },
      },
    ], new Date("2026-08-27T12:00:00Z"));

    const lines = renderUsageEntry(data, theme, new Date("2026-08-27T12:00:00Z")).split("\n");

    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("Grok");
    expect(lines[1]).toContain("usage unavailable");
    expect(lines.join("\n")).not.toContain("{\"");
  });

  it("explains an empty active-subscription result", () => {
    const data: UsageEntryData = {
      fetchedAt: "2026-08-27T12:00:00.000Z",
      providers: [],
    };

    const output = renderUsageEntry(data, theme, new Date("2026-08-27T12:00:00Z"));

    expect(output).toContain("No active quota subscriptions detected");
    expect(output.split("\n")).toHaveLength(2);
  });
});
