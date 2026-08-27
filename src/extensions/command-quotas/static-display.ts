import type { Theme } from "@mariozechner/pi-coding-agent";
import { PROVIDER_LABELS } from "../../lib/quotas.js";
import type {
  QuotasErrorKind,
  SupportedQuotaProvider,
} from "../../types/quotas.js";
import type { QuotaSnapshot } from "./visibility.js";

const RESET = "\x1b[0m";
const LABEL_WIDTH = 18;
const BAR_WIDTH = 10;
const PIE = ["○", "◔", "◑", "◕", "●"] as const;
const UNSAFE_CHARACTERS = new RegExp(
  `[${String.fromCodePoint(0)}-${String.fromCodePoint(31)}`
    + `${String.fromCodePoint(127)}-${String.fromCodePoint(159)}`
    + "\u202a-\u202e\u2066-\u2069]",
  "gu",
);

function rgb(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `\x1b[38;2;${(value >> 16) & 255};${(value >> 8) & 255};${value & 255}m`;
}

const PROVIDER_COLORS: Record<SupportedQuotaProvider, string> = {
  anthropic: rgb("#d77757"),
  "openai-codex": rgb("#ffffff"),
  "github-copilot": rgb("#58a66a"),
  openrouter: rgb("#b58cff"),
  synthetic: rgb("#63c7bd"),
  xai: rgb("#8a8a8a"),
  zai: rgb("#9b8cff"),
  "zai-coding-cn": rgb("#9b8cff"),
  "opencode-go": rgb("#4fa8ff"),
  "kimi-coding": rgb("#4fa8ff"),
};

export interface UsageWindow {
  label: string;
  usedPercent: number;
  resetsAt: string | null;
  windowSeconds: number;
  usedValue: number;
  limitValue: number;
  isCurrency?: boolean;
  limited?: boolean;
}

export type UsageProviderSnapshot =
  | {
      provider: SupportedQuotaProvider;
      windows: UsageWindow[];
    }
  | {
      provider: SupportedQuotaProvider;
      error: { kind: QuotasErrorKind; message: string };
    };

export interface UsageEntryData {
  fetchedAt: string;
  providers: UsageProviderSnapshot[];
}

function clean(value: unknown, max = 240): string {
  return String(value ?? "")
    .replace(UNSAFE_CHARACTERS, "")
    .trim()
    .slice(0, max);
}

function clampPercent(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function formatDuration(resetAt: Date, now: Date): string {
  const delta = resetAt.getTime() - now.getTime();
  if (!Number.isFinite(delta) || delta <= 0) return "soon";
  const minutes = Math.round(delta / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (!days && mins) parts.push(`${mins}m`);
  return parts.join(" ") || "<1m";
}

function elapsedPie(windowSeconds: number, resetAt: Date, now: Date): string {
  if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) return PIE[0];
  const remaining = Math.max(
    0,
    Math.min(1, (resetAt.getTime() - now.getTime()) / (windowSeconds * 1000)),
  );
  return PIE[Math.round((1 - remaining) * (PIE.length - 1))] ?? PIE[0];
}

function renderBar(percent: number): string {
  const filled = Math.round((clampPercent(percent) / 100) * BAR_WIDTH);
  return `${"█".repeat(filled)}${"░".repeat(BAR_WIDTH - filled)}`;
}

function formatValue(window: UsageWindow): string {
  if (window.label === "Spend cap" && window.limitValue <= 1) {
    return window.limited ? "REACHED" : "OK";
  }

  const percent = `${Math.round(clampPercent(window.usedPercent))}%`;
  if (window.isCurrency) {
    if (window.limitValue === 0) return `${percent}  $${window.usedValue.toFixed(2)} used`;
    return `${percent}  $${window.usedValue.toFixed(2)}/$${window.limitValue.toFixed(2)}`;
  }
  if (window.limitValue > 0 && window.limitValue !== 100) {
    return `${percent}  ${formatNumber(window.usedValue)}/${formatNumber(window.limitValue)}`;
  }
  return percent;
}

function renderWindow(window: UsageWindow, now: Date): string {
  const label = clean(window.label, LABEL_WIDTH).padEnd(LABEL_WIDTH);
  const resetAt = window.resetsAt ? new Date(window.resetsAt) : null;
  const reset = resetAt && Number.isFinite(resetAt.getTime())
    ? ` reset ${elapsedPie(window.windowSeconds, resetAt, now)} ${formatDuration(resetAt, now)}`
    : "";
  return `  ${label} ${renderBar(window.usedPercent)} ${formatValue(window)}${reset}`;
}

export function serializeUsageEntry(
  snapshots: QuotaSnapshot[],
  fetchedAt = new Date(),
): UsageEntryData {
  return {
    fetchedAt: fetchedAt.toISOString(),
    providers: snapshots.map(({ provider, result }): UsageProviderSnapshot => {
      if (!result.success) {
        return {
          provider,
          error: {
            kind: result.error.kind,
            message: clean(result.error.message),
          },
        };
      }
      return {
        provider,
        windows: result.data.windows.map((window) => ({
          label: clean(window.label),
          usedPercent: clampPercent(window.usedPercent),
          resetsAt: window.resetsAt.getTime() > 0
            ? window.resetsAt.toISOString()
            : null,
          windowSeconds: window.windowSeconds,
          usedValue: window.usedValue,
          limitValue: window.limitValue,
          isCurrency: window.isCurrency,
          limited: window.limited,
        })),
      };
    }),
  };
}

export function renderUsageEntry(
  data: UsageEntryData,
  theme: Pick<Theme, "fg">,
  now = new Date(),
): string {
  const lines: string[] = [];

  if (data.providers.length === 0) {
    lines.push(theme.fg("dim", "No active quota subscriptions detected"));
  } else {
    for (const snapshot of data.providers) {
      lines.push(
        `${PROVIDER_COLORS[snapshot.provider]}${PROVIDER_LABELS[snapshot.provider]}${RESET}`,
      );
      if ("error" in snapshot) {
        lines.push(`  ${theme.fg("warning", clean(snapshot.error.message))}`);
      } else if (snapshot.windows.length === 0) {
        lines.push(`  ${theme.fg("dim", "No quota windows available")}`);
      } else {
        lines.push(...snapshot.windows.map((window) => renderWindow(window, now)));
      }
    }
  }

  const fetchedAt = new Date(data.fetchedAt);
  const fetched = Number.isFinite(fetchedAt.getTime())
    ? fetchedAt.toLocaleTimeString()
    : "unknown";
  lines.push(theme.fg("dim", `fetched ${fetched}`));
  return lines.join("\n");
}
