import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import {
  QUOTAS_CONFIG_UPDATED_EVENT,
  QUOTAS_EXTENSIONS_REGISTER_EVENT,
  QUOTAS_EXTENSIONS_REQUEST_EVENT,
  QUOTAS_PROVIDER_CONFIG_UPDATED_EVENT,
  type QuotasConfigUpdatedPayload,
  type QuotasProviderConfigUpdatedPayload,
  configLoader,
} from "../../config.js";

/** Event emitted by pi-synthetic when its usage-status extension registers. */
const SYNTHETIC_EXTENSIONS_REGISTER_EVENT = "synthetic:extensions:register";
interface SyntheticExtensionsRegisterPayload {
  feature: string;
}
import { quotaAuthStorage } from "../../lib/auth.js";
import {
  fetchProviderQuotas,
  isSupportedProvider,
} from "../../lib/quotas.js";
import {
  assessWindow,
  formatTimeRemaining,
} from "../../utils/quotas-severity.js";
import type {
  QuotaWindow,
  SupportedQuotaProvider,
} from "../../types/quotas.js";
import { formatWindowStatus, type WindowStatus } from "./format-status.js";

const EXTENSION_ID = "pi-quotas-usage";
const REFRESH_INTERVAL_MS = 60_000;
const STALE_CONTEXT_MESSAGE = "This extension ctx is stale";

function isStaleContextError(error: unknown): boolean {
  return error instanceof Error && error.message.includes(STALE_CONTEXT_MESSAGE);
}

function getContextProvider(ctx: ExtensionContext | undefined): string | undefined {
  if (!ctx) return undefined;
  try {
    return ctx.model?.provider;
  } catch (error) {
    if (isStaleContextError(error)) return undefined;
    throw error;
  }
}

function formatFooterResetTime(resetsAt: string): string {
  const remaining = formatTimeRemaining(new Date(resetsAt));
  return remaining === "now" ? "now" : `in ${remaining}`;
}

const FOOTER_PROVIDER_LABELS: Record<SupportedQuotaProvider, string> = {
  anthropic: "Claude",
  "openai-codex": "Codex",
  "github-copilot": "Copilot",
  openrouter: "OpenRouter",
  synthetic: "Synthetic",
  xai: "Grok",
  zai: "Z.ai",
  "zai-coding-cn": "GLM CN",
  "opencode-go": "Go",
  "kimi-coding": "Kimi",
};

export function formatStatus(
  ctx: Pick<ExtensionContext, "ui">,
  windows: WindowStatus[],
  provider?: SupportedQuotaProvider,
): string {
  const theme = ctx.ui.theme;
  const windowStatus = windows
    .map((w) => {
      const core = formatWindowStatus(theme, w);
      const reset = w.resetsAt
        ? theme.fg("dim", ` (reset ${formatFooterResetTime(w.resetsAt)})`)
        : "";
      return `${core}${reset}`;
    })
    .join(" | ");
  if (!provider) return windowStatus;
  return `${theme.fg("accent", FOOTER_PROVIDER_LABELS[provider])} | ${windowStatus}`;
}

const ANTHROPIC_SUBSCRIPTION_WINDOW_LABELS = new Set([
  "5h",
  "7d",
  "7d Sonnet",
  "7d Opus",
  "7d Opus (legacy)",
]);

function shouldShowInStatus(window: QuotaWindow): boolean {
  return !(
    window.provider === "anthropic" &&
    ANTHROPIC_SUBSCRIPTION_WINDOW_LABELS.has(window.label)
  );
}

export function toWindowStatus(window: QuotaWindow): WindowStatus {
  return {
    label: window.label,
    usedPercent: window.usedPercent,
    severity: assessWindow(window).severity,
    resetsAt: window.resetsAt.getTime() > 0 ? window.resetsAt.toISOString() : null,
    limited: window.limited ?? false,
    isCurrency: window.isCurrency,
    usedValue: window.usedValue,
    limitValue: window.limitValue,
  };
}

export function toStatusWindows(windows: QuotaWindow[]): WindowStatus[] {
  return windows.filter(shouldShowInStatus).map(toWindowStatus);
}

export function formatStatusForFooter(
  ctx: Pick<ExtensionContext, "ui">,
  windows: WindowStatus[],
  provider?: SupportedQuotaProvider,
): string | undefined {
  if (windows.length === 0) return undefined;
  return formatStatus(ctx, windows, provider);
}

function formatProviderMessage(
  ctx: Pick<ExtensionContext, "ui">,
  provider: SupportedQuotaProvider,
  message: string,
): string {
  return `${ctx.ui.theme.fg("accent", FOOTER_PROVIDER_LABELS[provider])}: ${ctx.ui.theme.fg("warning", message)}`;
}

function createStatusRefresher() {
  let refreshTimer: ReturnType<typeof setInterval> | undefined;
  let activeContext: ExtensionContext | undefined;
  let activeProvider: SupportedQuotaProvider | undefined;
  let lastStatus:
    | { provider: SupportedQuotaProvider; windows: WindowStatus[] }
    | undefined;
  let inFlight = false;
  let queued = false;

  // Bumped whenever the active ctx/provider is replaced or the refresher stops.
  // This prevents an old async fetch from writing to a replacement session.
  let generation = 0;

  function deactivate(): void {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = undefined;
    activeContext = undefined;
    activeProvider = undefined;
    lastStatus = undefined;
    queued = false;
    generation++;
  }

  function setStatusSafely(
    ctx: ExtensionContext | undefined,
    text: string | undefined | ((ctx: ExtensionContext) => string | undefined),
  ): boolean {
    if (!ctx) return false;
    try {
      if (!ctx.hasUI) return true;
      ctx.ui.setStatus(EXTENSION_ID, typeof text === "function" ? text(ctx) : text);
      return true;
    } catch (error) {
      if (isStaleContextError(error) && activeContext === ctx) deactivate();
      return false;
    }
  }

  function setTransientFailureStatus(
    ctx: ExtensionContext,
    provider: SupportedQuotaProvider,
  ): void {
    const previousWindows =
      lastStatus?.provider === provider ? lastStatus.windows : undefined;
    setStatusSafely(ctx, (currentCtx) => {
      const previous = previousWindows
        ? formatStatusForFooter(currentCtx, previousWindows, provider)
        : undefined;
      return previous
        ? `${previous}${currentCtx.ui.theme.fg("dim", " ~")}`
        : formatProviderMessage(currentCtx, provider, "unavailable");
    });
  }

  async function update(ctx: ExtensionContext, requestGeneration = generation): Promise<void> {
    if (inFlight) {
      queued = true;
      return;
    }
    inFlight = true;
    try {
      if (requestGeneration !== generation || activeContext !== ctx) return;
      if (!ctx.hasUI || !activeProvider || !isSupportedProvider(activeProvider)) return;

      const provider = activeProvider;
      const result = await fetchProviderQuotas(quotaAuthStorage(ctx.modelRegistry), provider);
      if (requestGeneration !== generation || activeContext !== ctx) return;

      if (!result.success) {
        // A "not applicable" result (e.g. a direct Anthropic API key with no
        // OAuth subscription usage) is expected, not a failure — show nothing
        // rather than a persistent "usage unavailable" warning.
        if (result.error.kind === "not_applicable") {
          lastStatus = undefined;
          setStatusSafely(ctx, undefined);
          return;
        }
        if (result.error.kind === "config") {
          lastStatus = undefined;
          setStatusSafely(
            ctx,
            provider === "opencode-go"
              ? (ctx) => formatProviderMessage(ctx, provider, "setup required")
              : undefined,
          );
          return;
        }
        setTransientFailureStatus(ctx, provider);
        return;
      }
      const windows: WindowStatus[] = toStatusWindows(result.data.windows);
      const status = formatStatusForFooter(ctx, windows, provider);
      lastStatus =
        status === undefined ? undefined : { provider, windows };
      setStatusSafely(ctx, status);
    } catch (error) {
      if (isStaleContextError(error)) {
        if (activeContext === ctx) deactivate();
        return;
      }
      if (requestGeneration !== generation || activeContext !== ctx) return;
      const provider = activeProvider;
      if (!provider) return;
      setTransientFailureStatus(ctx, provider);
    } finally {
      inFlight = false;
      if (queued && activeContext) {
        queued = false;
        void update(activeContext, generation).catch(() => undefined);
      }
    }
  }

  return {
    async refreshFor(ctx: ExtensionContext): Promise<void> {
      activeContext = ctx;
      const requestedProvider = getContextProvider(ctx);
      const providerChanged = requestedProvider !== activeProvider;
      if (providerChanged) {
        lastStatus = undefined;
        setStatusSafely(ctx, undefined);
      }
      activeProvider = isSupportedProvider(requestedProvider)
        ? requestedProvider
        : undefined;
      generation++;
      const requestGeneration = generation;
      if (!activeProvider) {
        setStatusSafely(ctx, undefined);
        return;
      }
      await update(ctx, requestGeneration);
    },
    start(): void {
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = setInterval(() => {
        if (activeContext) void update(activeContext, generation).catch(() => undefined);
      }, REFRESH_INTERVAL_MS);
      refreshTimer.unref?.();
    },
    stop(ctx?: ExtensionContext): void {
      deactivate();
      setStatusSafely(ctx, undefined);
    },
    renderLast(ctx: ExtensionContext): boolean {
      if (!lastStatus) return false;
      return setStatusSafely(ctx, (ctx) =>
        lastStatus
          ? formatStatusForFooter(
            ctx,
            lastStatus.windows,
            lastStatus.provider,
          )
          : undefined,
      );
    },
  };
}

export default async function (pi: ExtensionAPI) {
  await configLoader.load();
  const refresher = createStatusRefresher();
  const unsubscribeEventBusListeners: Array<() => void> = [];
  let enabled = configLoader.getConfig().usageStatus;
  let deferToSynthetic = configLoader.getConfig().deferToSynthetic;
  let currentContext: ExtensionContext | undefined;

  /** Whether pi-synthetic's usage footer is active in this session. */
  let syntheticUsageActive = false;

  unsubscribeEventBusListeners.push(pi.events.on(SYNTHETIC_EXTENSIONS_REGISTER_EVENT, (data: unknown) => {
    const { feature } = data as SyntheticExtensionsRegisterPayload;
    if (feature === "usageStatus") {
      syntheticUsageActive = true;
      // If currently showing synthetic data, clear our footer
      if (currentContext && enabled && deferToSynthetic && getContextProvider(currentContext) === "synthetic") {
        refresher.stop(currentContext);
      }
    }
  }));

  function scheduleRefresh(ctx: ExtensionContext): void {
    void refresher.refreshFor(ctx).catch(() => undefined);
  }

  unsubscribeEventBusListeners.push(pi.events.on(QUOTAS_CONFIG_UPDATED_EVENT, (data: unknown) => {
    const config = (data as QuotasConfigUpdatedPayload).config;
    enabled = config.usageStatus;
    deferToSynthetic = config.deferToSynthetic;
    if (!enabled) {
      refresher.stop(currentContext);
      return;
    }
    if (currentContext) {
      refresher.start();
      scheduleRefresh(currentContext);
    }
  }));

  unsubscribeEventBusListeners.push(
    pi.events.on(QUOTAS_PROVIDER_CONFIG_UPDATED_EVENT, (data: unknown) => {
      const { provider } = data as QuotasProviderConfigUpdatedPayload;
      if (
        enabled &&
        currentContext &&
        provider === getContextProvider(currentContext)
      ) {
        scheduleRefresh(currentContext);
      }
    }),
  );

  /**
   * Whether to suppress our footer because pi-synthetic is showing
   * the same data for the Synthetic provider.
   */
  function shouldDeferToSynthetic(provider: string | undefined): boolean {
    return deferToSynthetic && syntheticUsageActive && provider === "synthetic";
  }

  pi.on("session_start", (_event, ctx) => {
    currentContext = ctx;
    if (!enabled) {
      refresher.stop(ctx);
      return;
    }
    if (shouldDeferToSynthetic(getContextProvider(ctx))) {
      refresher.stop(ctx);
      return;
    }
    refresher.start();
    scheduleRefresh(ctx);
  });

  pi.on("turn_end", (_event, ctx) => {
    currentContext = ctx;
    if (!enabled) return;
    if (shouldDeferToSynthetic(getContextProvider(ctx))) {
      refresher.stop(ctx);
      return;
    }
    scheduleRefresh(ctx);
  });

  pi.on("model_select", (_event, ctx) => {
    currentContext = ctx;
    if (!enabled) {
      refresher.stop(ctx);
      return;
    }
    if (shouldDeferToSynthetic(getContextProvider(ctx))) {
      refresher.stop(ctx);
      return;
    }
    scheduleRefresh(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    currentContext = undefined;
    syntheticUsageActive = false;
    refresher.stop(ctx);
    for (const unsubscribe of unsubscribeEventBusListeners.splice(0)) {
      unsubscribe();
    }
  });

  unsubscribeEventBusListeners.push(pi.events.on(QUOTAS_EXTENSIONS_REQUEST_EVENT, () => {
    if (configLoader.getConfig().usageStatus) {
      pi.events.emit(QUOTAS_EXTENSIONS_REGISTER_EVENT, { feature: "usageStatus" });
    }
  }));
}
