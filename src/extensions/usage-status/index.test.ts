import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import usageStatusExtension from "./index.js";
import { fetchProviderQuotas } from "../../lib/quotas.js";

vi.mock("../../config.js", () => ({
  QUOTAS_CONFIG_UPDATED_EVENT: "quotas:config:updated",
  QUOTAS_EXTENSIONS_REGISTER_EVENT: "quotas:extensions:register",
  QUOTAS_EXTENSIONS_REQUEST_EVENT: "quotas:extensions:request",
  QUOTAS_PROVIDER_CONFIG_UPDATED_EVENT: "quotas:provider-config:updated",
  configLoader: {
    load: vi.fn(async () => undefined),
    getConfig: vi.fn(() => ({
      configVersion: "test",
      quotasCommand: true,
      providerCommands: true,
      usageStatus: true,
      quotaWarnings: true,
      deferToSynthetic: true,
    })),
  },
}));

vi.mock("../../lib/quotas.js", () => ({
  isSupportedProvider: (provider: string | undefined) =>
    [
      "anthropic",
      "openai-codex",
      "github-copilot",
      "openrouter",
      "synthetic",
      "xai",
      "zai",
      "zai-coding-cn",
      "opencode-go",
      "kimi-coding",
    ].includes(provider ?? ""),
  fetchProviderQuotas: vi.fn(async () => ({
    success: true,
    data: { provider: "anthropic", windows: [] },
  })),
}));

const STALE_CONTEXT_ERROR =
  "This extension ctx is stale after session replacement or reload.";

type EventHandler = (event: unknown, ctx: ExtensionContext) => unknown;

function createFakePi() {
  const extensionHandlers = new Map<string, EventHandler[]>();
  const eventBusHandlers = new Map<string, Array<(data: unknown) => void>>();

  const pi = {
    on(event: string, handler: EventHandler) {
      const handlers = extensionHandlers.get(event) ?? [];
      handlers.push(handler);
      extensionHandlers.set(event, handlers);
    },
    events: {
      on(channel: string, handler: (data: unknown) => void) {
        const handlers = eventBusHandlers.get(channel) ?? [];
        handlers.push(handler);
        eventBusHandlers.set(channel, handlers);
        return () => {
          const current = eventBusHandlers.get(channel) ?? [];
          eventBusHandlers.set(channel, current.filter((entry) => entry !== handler));
        };
      },
      emit(channel: string, data: unknown) {
        for (const handler of eventBusHandlers.get(channel) ?? []) handler(data);
      },
    },
  } as unknown as ExtensionAPI;

  return {
    pi,
    async emitExtensionEvent(event: string, ctx: ExtensionContext) {
      for (const handler of extensionHandlers.get(event) ?? []) {
        await handler({ type: event, reason: "test" }, ctx);
      }
    },
    emitBusEvent(channel: string, data: unknown) {
      pi.events.emit(channel, data);
    },
    listenerCount(channel: string) {
      return eventBusHandlers.get(channel)?.length ?? 0;
    },
  };
}

function createContext(provider: string) {
  let stale = false;
  let currentProvider = provider;
  const setStatus = vi.fn(() => {
    if (stale) throw new Error(STALE_CONTEXT_ERROR);
  });

  const ctx = {
    get hasUI() {
      if (stale) throw new Error(STALE_CONTEXT_ERROR);
      return true;
    },
    get model() {
      if (stale) throw new Error(STALE_CONTEXT_ERROR);
      return { provider: currentProvider };
    },
    modelRegistry: { authStorage: {} },
    ui: {
      theme: { fg: (_color: string, text: string) => text },
      setStatus,
    },
  } as unknown as ExtensionContext;

  return {
    ctx,
    setStale() {
      stale = true;
    },
    setProvider(provider: string) {
      currentProvider = provider;
    },
    setStatus,
  };
}

function quotaWindow(provider: "anthropic" | "openai-codex" | "opencode-go", label: string) {
  return {
    provider,
    label,
    usedPercent: 25,
    resetsAt: new Date("2026-08-28T00:00:00.000Z"),
    windowSeconds: 3600,
    usedValue: 25,
    limitValue: 100,
  };
}

function successResult(
  provider: "anthropic" | "openai-codex" | "opencode-go",
  label: string,
) {
  return {
    success: true as const,
    data: { provider, windows: [quotaWindow(provider, label)] },
  };
}

function lastStatusText(setStatus: ReturnType<typeof vi.fn>): string | undefined {
  const calls = setStatus.mock.calls as unknown as Array<
    [string, string | undefined]
  >;
  return calls.at(-1)?.[1];
}

beforeEach(() => {
  vi.mocked(fetchProviderQuotas).mockReset();
  vi.mocked(fetchProviderQuotas).mockResolvedValue({
    success: true,
    data: { provider: "anthropic", windows: [] },
  } as any);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("usage-status extension lifecycle", () => {
  it("ignores interval refreshes for stale session contexts", async () => {
    vi.useFakeTimers();
    const { pi, emitExtensionEvent } = createFakePi();
    const { ctx, setStale } = createContext("unsupported-provider");

    await usageStatusExtension(pi);
    await emitExtensionEvent("session_start", ctx);

    setStale();

    expect(() => vi.advanceTimersByTime(60_000)).not.toThrow();
    await vi.runOnlyPendingTimersAsync();
  });

  it("does not throw when event-bus callbacks see a stale session context", async () => {
    const { pi, emitExtensionEvent, emitBusEvent } = createFakePi();
    const { ctx, setStale } = createContext("synthetic");

    await usageStatusExtension(pi);
    await emitExtensionEvent("session_start", ctx);

    setStale();

    expect(() => {
      emitBusEvent("synthetic:extensions:register", { feature: "usageStatus" });
      emitBusEvent("quotas:config:updated", {
        config: { usageStatus: true, deferToSynthetic: true },
      });
    }).not.toThrow();
  });

  it("unsubscribes event-bus listeners during session shutdown", async () => {
    const { pi, emitExtensionEvent, listenerCount } = createFakePi();
    const { ctx } = createContext("unsupported-provider");

    await usageStatusExtension(pi);
    expect(listenerCount("quotas:config:updated")).toBe(1);
    expect(listenerCount("synthetic:extensions:register")).toBe(1);
    expect(listenerCount("quotas:extensions:request")).toBe(1);

    await emitExtensionEvent("session_shutdown", ctx);

    expect(listenerCount("quotas:config:updated")).toBe(0);
    expect(listenerCount("synthetic:extensions:register")).toBe(0);
    expect(listenerCount("quotas:extensions:request")).toBe(0);
  });

  it("clears the footer silently for not_applicable credentials instead of warning", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchProviderQuotas).mockResolvedValueOnce({
      success: false,
      error: { kind: "not_applicable", message: "Direct API key" },
    } as any);

    const { pi, emitExtensionEvent } = createFakePi();
    const { ctx, setStatus } = createContext("anthropic");

    await usageStatusExtension(pi);
    await emitExtensionEvent("session_start", ctx);
    await vi.runOnlyPendingTimersAsync();
    await vi.advanceTimersByTimeAsync(0);

    const calls = setStatus.mock.calls as unknown as Array<[string, string | undefined]>;
    const last = calls[calls.length - 1]?.[1];
    expect(last).toBeUndefined();
    expect(calls.some((c) => c[1] === "usage unavailable")).toBe(false);
  });

  it("labels quota data with the active model provider", async () => {
    vi.mocked(fetchProviderQuotas).mockResolvedValueOnce(
      successResult("openai-codex", "5h") as any,
    );
    const { pi, emitExtensionEvent } = createFakePi();
    const { ctx, setStatus } = createContext("openai-codex");

    await usageStatusExtension(pi);
    await emitExtensionEvent("session_start", ctx);

    await vi.waitFor(() => {
      expect(setStatus).toHaveBeenCalledWith(
        "pi-quotas-usage",
        expect.stringContaining("Codex"),
      );
    });
  });

  it("clears old provider data immediately when the model changes", async () => {
    let resolveAnthropic: ((value: ReturnType<typeof successResult>) => void) | undefined;
    vi.mocked(fetchProviderQuotas).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAnthropic = resolve as typeof resolveAnthropic;
        }),
    );
    const { pi, emitExtensionEvent } = createFakePi();
    const { ctx, setProvider, setStatus } = createContext("anthropic");
    await usageStatusExtension(pi);
    await emitExtensionEvent("session_start", ctx);
    setProvider("openai-codex");

    await emitExtensionEvent("model_select", ctx);

    expect(setStatus).toHaveBeenLastCalledWith("pi-quotas-usage", undefined);
    resolveAnthropic?.(successResult("anthropic", "AnthropicOnly"));
  });

  it("does not let an old in-flight provider overwrite the selected provider", async () => {
    let resolveAnthropic: ((value: ReturnType<typeof successResult>) => void) | undefined;
    vi.mocked(fetchProviderQuotas)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveAnthropic = resolve as typeof resolveAnthropic;
          }),
      )
      .mockResolvedValueOnce(successResult("openai-codex", "CodexOnly") as any);
    const { pi, emitExtensionEvent } = createFakePi();
    const { ctx, setProvider, setStatus } = createContext("anthropic");
    await usageStatusExtension(pi);
    await emitExtensionEvent("session_start", ctx);
    setProvider("openai-codex");
    await emitExtensionEvent("model_select", ctx);

    resolveAnthropic?.(successResult("anthropic", "AnthropicOnly"));

    await vi.waitFor(() => {
      const text = lastStatusText(setStatus);
      expect(text).toContain("CodexOnly");
      expect(text).not.toContain("AnthropicOnly");
    });
  });

  it("retains last-good data with a stale marker after a transient same-provider failure", async () => {
    vi.mocked(fetchProviderQuotas)
      .mockResolvedValueOnce(successResult("openai-codex", "5h") as any)
      .mockResolvedValueOnce({
        success: false,
        error: { kind: "network", message: "offline" },
      } as any);
    const { pi, emitExtensionEvent } = createFakePi();
    const { ctx, setStatus } = createContext("openai-codex");
    await usageStatusExtension(pi);
    await emitExtensionEvent("session_start", ctx);
    await vi.waitFor(() =>
      expect(lastStatusText(setStatus)).toContain("Codex"),
    );

    await emitExtensionEvent("turn_end", ctx);

    await vi.waitFor(() => {
      const text = lastStatusText(setStatus);
      expect(text).toContain("Codex");
      expect(text).toContain("~");
      expect(text).not.toContain("usage unavailable");
    });
  });

  it("shows a compact provider unavailable status without last-good data", async () => {
    vi.mocked(fetchProviderQuotas).mockResolvedValueOnce({
      success: false,
      error: { kind: "timeout", message: "timed out" },
    } as any);
    const { pi, emitExtensionEvent } = createFakePi();
    const { ctx, setStatus } = createContext("openai-codex");
    await usageStatusExtension(pi);

    await emitExtensionEvent("session_start", ctx);

    await vi.waitFor(() => {
      expect(lastStatusText(setStatus)).toContain("Codex: unavailable");
    });
  });

  it("shows an OpenCode Go setup action for missing dashboard configuration", async () => {
    vi.mocked(fetchProviderQuotas).mockResolvedValueOnce({
      success: false,
      error: { kind: "config", message: "No OpenCode Go config" },
    } as any);
    const { pi, emitExtensionEvent } = createFakePi();
    const { ctx, setStatus } = createContext("opencode-go");
    await usageStatusExtension(pi);

    await emitExtensionEvent("session_start", ctx);

    await vi.waitFor(() => {
      expect(lastStatusText(setStatus)).toContain("Go: setup required");
    });
  });

  it("refreshes active quota data after provider configuration changes", async () => {
    vi.mocked(fetchProviderQuotas)
      .mockResolvedValueOnce(successResult("opencode-go", "5h Rolling") as any)
      .mockResolvedValueOnce(successResult("opencode-go", "Weekly") as any);
    const { pi, emitExtensionEvent, emitBusEvent } = createFakePi();
    const { ctx, setStatus } = createContext("opencode-go");
    await usageStatusExtension(pi);
    await emitExtensionEvent("session_start", ctx);
    await vi.waitFor(() => expect(fetchProviderQuotas).toHaveBeenCalledTimes(1));

    emitBusEvent("quotas:provider-config:updated", { provider: "opencode-go" });

    await vi.waitFor(() => expect(fetchProviderQuotas).toHaveBeenCalledTimes(2));
    expect(lastStatusText(setStatus)).toContain("weekly:");
  });
});
