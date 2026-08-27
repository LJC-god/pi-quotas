import type {
  ExtensionAPI,
  ExtensionCommandContext,
  Theme,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import {
  QUOTAS_EXTENSIONS_REGISTER_EVENT,
  QUOTAS_EXTENSIONS_REQUEST_EVENT,
  configLoader,
} from "../../config.js";
import { quotaAuthStorage } from "../../lib/auth.js";
import {
  fetchAllProviderQuotas,
  fetchProviderQuotas,
  SUPPORTED_PROVIDERS,
} from "../../lib/quotas.js";
import type { SupportedQuotaProvider } from "../../types/quotas.js";
import { registerOpenCodeGoCommands } from "./opencode-go-commands.js";
import { getProviderCommandInfo } from "./provider-commands.js";
import {
  renderUsageEntry,
  serializeUsageEntry,
  type UsageEntryData,
} from "./static-display.js";
import {
  filterDashboardSnapshots,
  type QuotaSnapshot,
} from "./visibility.js";

const USAGE_ENTRY_TYPE = "provider-usage";

type EntryRendererAPI = ExtensionAPI & {
  registerEntryRenderer?: (
    customType: string,
    renderer: (
      entry: { data?: unknown },
      options: { expanded?: boolean },
      theme: Theme,
    ) => Text | undefined,
  ) => void;
};

function isUsageEntryData(value: unknown): value is UsageEntryData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<UsageEntryData>;
  return typeof candidate.fetchedAt === "string" && Array.isArray(candidate.providers);
}

function parseRefreshArgument(
  commandName: string,
  args: string | undefined,
  ctx: ExtensionCommandContext,
): boolean | undefined {
  const arg = String(args ?? "").trim();
  if (!arg) return false;
  if (arg === "--refresh") return true;
  ctx.ui.notify(`Usage: /${commandName} [--refresh]`, "warning");
  return undefined;
}

function registerUsageEntryRenderer(pi: ExtensionAPI): boolean {
  const entryApi = pi as EntryRendererAPI;
  if (typeof entryApi.registerEntryRenderer !== "function") return false;

  entryApi.registerEntryRenderer(
    USAGE_ENTRY_TYPE,
    (entry, _options, theme) => {
      if (!isUsageEntryData(entry.data)) {
        return new Text(theme.fg("warning", "Invalid quota entry"), 0, 0);
      }
      return new Text(renderUsageEntry(entry.data, theme), 0, 0);
    },
  );
  return true;
}

function outputUsageEntry(
  pi: ExtensionAPI,
  supportsEntryRenderer: boolean,
  snapshots: QuotaSnapshot[],
  ctx: ExtensionCommandContext,
): void {
  const data = serializeUsageEntry(snapshots);
  if (supportsEntryRenderer) {
    pi.appendEntry(USAGE_ENTRY_TYPE, data);
    return;
  }
  ctx.ui.notify(renderUsageEntry(data, ctx.ui.theme), "info");
}

function combinedUsageHandler(
  pi: ExtensionAPI,
  supportsEntryRenderer: boolean,
  commandName: "usage" | "quotas",
) {
  return async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
    if (!configLoader.getConfig().quotasCommand) {
      ctx.ui.notify(`/${commandName} is disabled. Re-enable it in /quotas:settings.`, "warning");
      return;
    }
    const force = parseRefreshArgument(commandName, args, ctx);
    if (force === undefined) return;
    const snapshots = filterDashboardSnapshots(
      await fetchAllProviderQuotas(
        quotaAuthStorage(ctx.modelRegistry),
        { force },
      ),
    );
    outputUsageEntry(pi, supportsEntryRenderer, snapshots, ctx);
  };
}

function providerUsageHandler(
  pi: ExtensionAPI,
  supportsEntryRenderer: boolean,
  provider: SupportedQuotaProvider,
  commandName: string,
) {
  return async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
    if (!configLoader.getConfig().providerCommands) {
      ctx.ui.notify(`/${commandName} is disabled. Re-enable it in /quotas:settings.`, "warning");
      return;
    }
    const force = parseRefreshArgument(commandName, args, ctx);
    if (force === undefined) return;
    const result = await fetchProviderQuotas(
      quotaAuthStorage(ctx.modelRegistry),
      provider,
      { force },
    );
    outputUsageEntry(pi, supportsEntryRenderer, [{ provider, result }], ctx);
  };
}

export function registerQuotasCommands(pi: ExtensionAPI): void {
  const supportsEntryRenderer = registerUsageEntryRenderer(pi);

  pi.registerCommand("usage", {
    description: "Show subscription quota for connected providers",
    handler: combinedUsageHandler(pi, supportsEntryRenderer, "usage"),
  });

  pi.registerCommand("quotas", {
    description: "Show subscription quota for connected providers (alias of /usage)",
    handler: combinedUsageHandler(pi, supportsEntryRenderer, "quotas"),
  });

  for (const provider of SUPPORTED_PROVIDERS) {
    const info = getProviderCommandInfo(provider);
    pi.registerCommand(info.commandName, {
      description: `Show remaining ${info.title.toLowerCase()}`,
      handler: providerUsageHandler(
        pi,
        supportsEntryRenderer,
        provider,
        info.commandName,
      ),
    });
  }
}

export default async function (pi: ExtensionAPI) {
  await configLoader.load();
  registerOpenCodeGoCommands(pi);

  const config = configLoader.getConfig();
  if (config.quotasCommand || config.providerCommands) {
    registerQuotasCommands(pi);
  }

  pi.events.on(QUOTAS_EXTENSIONS_REQUEST_EVENT, () => {
    if (configLoader.getConfig().quotasCommand) {
      pi.events.emit(QUOTAS_EXTENSIONS_REGISTER_EVENT, { feature: "quotasCommand" });
    }
    if (configLoader.getConfig().providerCommands) {
      pi.events.emit(QUOTAS_EXTENSIONS_REGISTER_EVENT, { feature: "providerCommands" });
    }
  });
}
