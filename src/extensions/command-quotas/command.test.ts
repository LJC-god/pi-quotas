import { AuthStorage } from "@mariozechner/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configLoader } from "../../config.js";
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

function registeredCommands() {
  const commands = new Map<string, any>();
  registerQuotasCommands({
    registerCommand(name: string, command: any) {
      commands.set(name, command);
    },
  } as any);
  return commands;
}

function contextWithoutCredentials(notify: ReturnType<typeof vi.fn>) {
  return {
    modelRegistry: { authStorage: AuthStorage.inMemory({}) },
    ui: {
      custom: async () => undefined,
      notify,
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

  it("hides unconfigured providers from the combined dashboard", async () => {
    const commands = registeredCommands();
    const notify = vi.fn();

    await commands.get("quotas").handler(
      "",
      contextWithoutCredentials(notify),
    );

    expect(notify).toHaveBeenCalledWith("No quota data available", "info");
  });

  it("keeps provider-specific commands diagnostic", async () => {
    const commands = registeredCommands();
    const notify = vi.fn();

    await commands.get("anthropic:quotas").handler(
      "",
      contextWithoutCredentials(notify),
    );

    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("No Anthropic OAuth token found"),
      "info",
    );
  });
});
