import { AuthStorage } from "@mariozechner/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configLoader } from "../../config.js";
import * as quotaLibrary from "../../lib/quotas.js";
import { clearOpenCodeGoConfigCache } from "../../providers/opencode-go-config.js";
import quotaCommandsExtension, { registerQuotasCommands } from "./command.js";

const originalWorkspaceId = process.env.OPENCODE_GO_WORKSPACE_ID;
const originalAuthCookie = process.env.OPENCODE_GO_AUTH_COOKIE;

beforeEach(() => {
  clearOpenCodeGoConfigCache();
  process.env.OPENCODE_GO_WORKSPACE_ID = "test-workspace";
  delete process.env.OPENCODE_GO_AUTH_COOKIE;
});

afterEach(() => {
  clearOpenCodeGoConfigCache();
  if (originalWorkspaceId === undefined) {
    delete process.env.OPENCODE_GO_WORKSPACE_ID;
  } else {
    process.env.OPENCODE_GO_WORKSPACE_ID = originalWorkspaceId;
  }
  if (originalAuthCookie === undefined) {
    delete process.env.OPENCODE_GO_AUTH_COOKIE;
  } else {
    process.env.OPENCODE_GO_AUTH_COOKIE = originalAuthCookie;
  }
  vi.restoreAllMocks();
});

function registeredRuntime(options: { entryRenderer?: boolean } = { entryRenderer: true }) {
  const commands = new Map<string, any>();
  const renderers = new Map<string, any>();
  const appendEntry = vi.fn();
  const pi: Record<string, unknown> = {
    registerCommand(name: string, command: any) {
      commands.set(name, command);
    },
    appendEntry,
  };
  if (options.entryRenderer) {
    pi.registerEntryRenderer = (name: string, renderer: any) => {
      renderers.set(name, renderer);
    };
  }
  registerQuotasCommands(pi as any);
  return { appendEntry, commands, renderers };
}

function contextWithoutCredentials(notify: ReturnType<typeof vi.fn>) {
  return {
    modelRegistry: { authStorage: AuthStorage.inMemory({}) },
    ui: {
      notify,
      theme: {
        fg: (_color: string, text: string) => text,
      },
    },
  } as any;
}

describe("quota command visibility", () => {
  it("keeps OpenCode Go credential commands loaded when quota views are disabled", async () => {
    vi.spyOn(configLoader, "load").mockResolvedValueOnce();
    vi.spyOn(configLoader, "getConfig").mockReturnValueOnce({
      configVersion: "test",
      quotasCommand: false,
      providerCommands: false,
      usageStatus: true,
      tokenStatus: true,
      quotaWarnings: true,
      deferToSynthetic: true,
    });
    const commands = new Map<string, any>();
    const pi = {
      registerCommand(name: string, command: any) {
        commands.set(name, command);
      },
      events: { on: vi.fn() },
    } as any;

    await quotaCommandsExtension(pi);

    expect(commands.has("opencode-go:setup")).toBe(true);
    expect(commands.has("opencode-go:clear")).toBe(true);
    expect(commands.has("quotas")).toBe(false);
  });

  it("registers /usage, the /quotas alias, and a transcript entry renderer", () => {
    const { commands, renderers } = registeredRuntime();

    expect(commands.has("usage")).toBe(true);
    expect(commands.has("quotas")).toBe(true);
    expect(renderers.has("provider-usage")).toBe(true);
  });

  it("appends a static entry and hides unconfigured providers", async () => {
    const { appendEntry, commands } = registeredRuntime();
    const notify = vi.fn();

    await commands.get("usage").handler(
      "",
      contextWithoutCredentials(notify),
    );

    expect(appendEntry).toHaveBeenCalledOnce();
    expect(appendEntry).toHaveBeenCalledWith(
      "provider-usage",
      expect.objectContaining({ providers: [] }),
    );
    expect(notify).not.toHaveBeenCalled();
  });

  it("uses the same static handler for /quotas compatibility", async () => {
    const { appendEntry, commands } = registeredRuntime();

    await commands.get("quotas").handler(
      "",
      contextWithoutCredentials(vi.fn()),
    );

    expect(appendEntry).toHaveBeenCalledWith(
      "provider-usage",
      expect.objectContaining({ providers: [] }),
    );
  });

  it("supports --refresh and rejects other /usage arguments", async () => {
    const fetchAll = vi.spyOn(quotaLibrary, "fetchAllProviderQuotas").mockResolvedValue([]);
    const { appendEntry, commands } = registeredRuntime();
    const notify = vi.fn();
    const ctx = contextWithoutCredentials(notify);

    await commands.get("usage").handler("--refresh", ctx);

    expect(fetchAll).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ force: true }),
    );
    expect(appendEntry).toHaveBeenCalledOnce();

    appendEntry.mockClear();
    await commands.get("usage").handler("unexpected", ctx);
    expect(appendEntry).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("Usage: /usage [--refresh]", "warning");
  });

  it("keeps provider-specific commands diagnostic", async () => {
    const { appendEntry, commands } = registeredRuntime();
    const notify = vi.fn();

    await commands.get("anthropic:quotas").handler(
      "",
      contextWithoutCredentials(notify),
    );

    expect(appendEntry).toHaveBeenCalledWith(
      "provider-usage",
      expect.objectContaining({
        providers: [
          expect.objectContaining({
            provider: "anthropic",
            error: expect.objectContaining({
              message: expect.stringContaining("No Anthropic OAuth token found"),
            }),
          }),
        ],
      }),
    );
    expect(notify).not.toHaveBeenCalled();
  });

  it("falls back to a compact notification when entry rendering is unavailable", async () => {
    const { appendEntry, commands } = registeredRuntime({ entryRenderer: false });
    const notify = vi.fn();

    await commands.get("usage").handler("", contextWithoutCredentials(notify));

    expect(appendEntry).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("No active quota subscriptions detected"),
      "info",
    );
  });
});
