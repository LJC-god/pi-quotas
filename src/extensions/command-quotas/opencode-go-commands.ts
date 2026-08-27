import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { Input } from "@mariozechner/pi-tui";
import { QUOTAS_PROVIDER_CONFIG_UPDATED_EVENT } from "../../config.js";
import { clearQuotaCache } from "../../lib/quotas.js";
import {
  clearOpenCodeGoConfig,
  clearOpenCodeGoConfigCache,
  normalizeOpenCodeGoAuthCookieInput,
  normalizeOpenCodeGoWorkspaceInput,
  resolveOpenCodeGoConfigFromEnv,
  saveOpenCodeGoConfig,
  type OpenCodeGoConfig,
  type ResolvedOpenCodeGoConfig,
} from "../../providers/opencode-go-config.js";
import {
  queryOpenCodeGoQuota,
  type OpenCodeGoResult,
} from "../../providers/opencode-go.js";
import { MaskedInput } from "./masked-input.js";

export interface OpenCodeGoCommandDependencies {
  validate(config: OpenCodeGoConfig): Promise<OpenCodeGoResult>;
  save(config: OpenCodeGoConfig): Promise<string>;
  clear(): Promise<boolean>;
  resolveEnv(): ResolvedOpenCodeGoConfig | null;
  clearConfigCache(): void;
  clearQuotaCache(): void;
}

const DEFAULT_DEPENDENCIES: OpenCodeGoCommandDependencies = {
  validate: (config) => queryOpenCodeGoQuota(config),
  save: (config) => saveOpenCodeGoConfig(config),
  clear: () => clearOpenCodeGoConfig(),
  resolveEnv: () => resolveOpenCodeGoConfigFromEnv(),
  clearConfigCache: () => clearOpenCodeGoConfigCache(),
  clearQuotaCache: () => clearQuotaCache("opencode-go"),
};

interface GuidedInputLine {
  text: string;
  accent?: boolean;
}

async function promptGuidedInput(
  ctx: ExtensionCommandContext,
  options: {
    title: string;
    lines: GuidedInputLine[];
    masked?: boolean;
  },
): Promise<string | null | undefined> {
  return ctx.ui.custom<string | null>((tui, theme, _keybindings, done) => {
    const input = options.masked ? new MaskedInput() : new Input();
    input.focused = true;
    input.onSubmit = (value) => done(value);
    input.onEscape = () => done(null);

    return {
      render(width: number): string[] {
        return [
          theme.bold(theme.fg("accent", options.title)),
          ...options.lines.map((line) =>
            theme.fg(line.accent ? "accent" : "dim", line.text),
          ),
          ...input.render(width),
        ];
      },
      handleInput(data: string): void {
        input.handleInput(data);
        tui.requestRender();
      },
      invalidate(): void {
        input.invalidate();
      },
      dispose(): void {
        input.setValue("");
      },
    };
  });
}

async function promptWorkspace(
  ctx: ExtensionCommandContext,
): Promise<string | null | undefined> {
  return promptGuidedInput(ctx, {
    title: "OpenCode Go - Step 1/2: Workspace",
    lines: [
      { text: "Open this link manually (Ctrl+click or copy):" },
      { text: "https://opencode.ai/auth", accent: true },
      { text: "Sign in, open your Go workspace, then copy its page URL:" },
      {
        text: "https://opencode.ai/workspace/<workspace-id>/go",
        accent: true,
      },
      { text: "Paste that URL or the raw workspace ID below." },
    ],
  });
}

async function promptMaskedCookie(
  ctx: ExtensionCommandContext,
): Promise<string | null | undefined> {
  return promptGuidedInput(ctx, {
    title: "OpenCode Go - Step 2/2: auth Cookie",
    masked: true,
    lines: [
      { text: "Find it: F12 > Application > Storage > Cookies" },
      { text: "> https://opencode.ai > auth > Value" },
      { text: "Copy only the auth value, not all cookies." },
      { text: "The value is masked and is never written to session history." },
    ],
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validationFailureMessage(result: Extract<OpenCodeGoResult, { success: false }>): string {
  if (
    result.status === 401 ||
    result.status === 403 ||
    /\b(?:401|403)\b/u.test(result.error)
  ) {
    return "OpenCode Go rejected the dashboard session. Copy a fresh auth cookie and try again.";
  }
  return "OpenCode Go quota validation failed. Check the workspace and auth cookie, then try again.";
}

function emitProviderConfigUpdated(pi: ExtensionAPI): void {
  pi.events.emit(QUOTAS_PROVIDER_CONFIG_UPDATED_EVENT, {
    provider: "opencode-go",
  });
}

export function registerOpenCodeGoCommands(
  pi: ExtensionAPI,
  dependencies: OpenCodeGoCommandDependencies = DEFAULT_DEPENDENCIES,
): void {
  pi.registerCommand("opencode-go:setup", {
    description: "Configure OpenCode Go dashboard quota access",
    handler: async (_args, ctx) => {
      const workspaceInput = await promptWorkspace(ctx);
      if (workspaceInput === null) return;
      if (workspaceInput === undefined) {
        ctx.ui.notify(
          "OpenCode Go setup requires Pi's interactive terminal UI.",
          "error",
        );
        return;
      }

      let workspaceId: string;
      try {
        workspaceId = normalizeOpenCodeGoWorkspaceInput(workspaceInput);
      } catch (error) {
        ctx.ui.notify(errorMessage(error), "error");
        return;
      }

      const cookieInput = await promptMaskedCookie(ctx);
      if (cookieInput === null) return;
      if (cookieInput === undefined) {
        ctx.ui.notify(
          "OpenCode Go setup requires Pi's interactive terminal UI.",
          "error",
        );
        return;
      }

      let authCookie: string;
      try {
        authCookie = normalizeOpenCodeGoAuthCookieInput(cookieInput);
      } catch (error) {
        ctx.ui.notify(errorMessage(error), "error");
        return;
      }

      const candidate = { workspaceId, authCookie };
      let validation: OpenCodeGoResult;
      try {
        validation = await dependencies.validate(candidate);
      } catch {
        ctx.ui.notify(
          "OpenCode Go quota validation failed. Check your connection and try again.",
          "error",
        );
        return;
      }
      if (!validation.success) {
        ctx.ui.notify(validationFailureMessage(validation), "error");
        return;
      }

      try {
        await dependencies.save(candidate);
      } catch {
        ctx.ui.notify("Could not save OpenCode Go quota access.", "error");
        return;
      }

      dependencies.clearConfigCache();
      dependencies.clearQuotaCache();
      emitProviderConfigUpdated(pi);
      ctx.ui.notify(
        `OpenCode Go quota access saved for workspace ${workspaceId}.`,
        "info",
      );

      if (dependencies.resolveEnv()) {
        ctx.ui.notify(
          "OpenCode Go environment variables override the saved quota configuration.",
          "warning",
        );
      }
    },
  });

  pi.registerCommand("opencode-go:clear", {
    description: "Clear saved OpenCode Go dashboard quota access",
    handler: async (_args, ctx) => {
      const confirmed = await ctx.ui.confirm(
        "Clear OpenCode Go quota access?",
        "This removes only the saved dashboard cookie, not Pi's model API key.",
      );
      if (!confirmed) return;

      let removed: boolean;
      try {
        removed = await dependencies.clear();
      } catch {
        ctx.ui.notify("Could not clear OpenCode Go quota access.", "error");
        return;
      }
      dependencies.clearConfigCache();
      dependencies.clearQuotaCache();
      emitProviderConfigUpdated(pi);
      ctx.ui.notify(
        removed
          ? "OpenCode Go quota access cleared."
          : "No saved OpenCode Go quota access was found.",
        "info",
      );
    },
  });
}
