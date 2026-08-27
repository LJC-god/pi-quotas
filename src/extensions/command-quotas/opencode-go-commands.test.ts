import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import * as commandModule from "./opencode-go-commands.js";

type RegisteredCommand = {
  handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
};

function createDependencies(
  overrides: Partial<{
    validate: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
    resolveEnv: ReturnType<typeof vi.fn>;
    clearConfigCache: ReturnType<typeof vi.fn>;
    clearQuotaCache: ReturnType<typeof vi.fn>;
  }> = {},
) {
  return {
    validate: vi.fn(async () => ({
      success: true as const,
      rolling: {
        usagePercent: 10,
        resetInSec: 60,
        percentRemaining: 90,
        resetTimeIso: "2026-08-27T12:00:00.000Z",
      },
    })),
    save: vi.fn(async () => "managed-config.json"),
    clear: vi.fn(async () => true),
    resolveEnv: vi.fn(() => null),
    clearConfigCache: vi.fn(),
    clearQuotaCache: vi.fn(),
    ...overrides,
  };
}

function registerCommands(dependencies = createDependencies()) {
  const commands = new Map<string, RegisteredCommand>();
  const emitted: Array<{ channel: string; data: unknown }> = [];
  const pi = {
    registerCommand(name: string, command: RegisteredCommand) {
      commands.set(name, command);
    },
    events: {
      emit(channel: string, data: unknown) {
        emitted.push({ channel, data });
      },
    },
  } as unknown as ExtensionAPI;

  const register = (commandModule as unknown as {
    registerOpenCodeGoCommands: (
      pi: ExtensionAPI,
      dependencies: ReturnType<typeof createDependencies>,
    ) => void;
  }).registerOpenCodeGoCommands;
  register(pi, dependencies);
  return { commands, dependencies, emitted };
}

function createContext(options?: {
  workspace?: string | "cancel" | "unavailable";
  secret?: string | "cancel" | "unavailable";
  confirm?: boolean;
}) {
  const notify = vi.fn();
  const input = vi.fn(async () => undefined);
  const confirm = vi.fn(async () => options?.confirm ?? true);
  const customRenders: string[][] = [];
  let guidedStep = 0;
  const custom = vi.fn(async (factory: any) => {
    const value = guidedStep++ === 0 ? options?.workspace : options?.secret;
    if (value === "unavailable") return undefined;
    let result: string | null | undefined;
    const component = await factory(
      { requestRender: vi.fn() },
      {
        fg: (_color: string, text: string) => text,
        bold: (text: string) => text,
      },
      {},
      (value: string | null) => {
        result = value;
      },
    );
    customRenders.push(component.render(120));
    component.handleInput(
      value === undefined || value === "cancel" ? "\u001b" : value,
    );
    if (value !== undefined && value !== "cancel") component.handleInput("\n");
    component.dispose?.();
    return result;
  });

  return {
    ctx: {
      ui: { input, custom, confirm, notify },
    } as unknown as ExtensionCommandContext,
    confirm,
    custom,
    customRenders,
    input,
    notify,
  };
}

function requireCommand(
  commands: Map<string, RegisteredCommand>,
  name: string,
): RegisteredCommand {
  const command = commands.get(name);
  expect(command, `${name} should be registered`).toBeDefined();
  return command!;
}

describe("OpenCode Go setup command registration and cancellation", () => {
  it("registers setup and clear independently of dashboard commands", () => {
    const { commands } = registerCommands();

    expect(commands.has("opencode-go:setup")).toBe(true);
    expect(commands.has("opencode-go:clear")).toBe(true);
  });

  it("combines the account guidance with the workspace input", async () => {
    const { commands } = registerCommands();
    const { ctx, confirm, custom, customRenders, input } = createContext({
      workspace: "ws_123",
      secret: "cancel",
    });

    await requireCommand(commands, "opencode-go:setup").handler("", ctx);

    expect(confirm).not.toHaveBeenCalled();
    expect(input).not.toHaveBeenCalled();
    expect(custom).toHaveBeenCalledTimes(2);
    const workspaceScreen = (customRenders[0] ?? []).join("\n");
    expect(workspaceScreen).toContain("Step 1/2");
    expect(workspaceScreen).toContain("https://opencode.ai/auth");
    expect(workspaceScreen).toContain(
      "https://opencode.ai/workspace/<workspace-id>/go",
    );
  });

  it("combines cookie guidance with the second masked input", async () => {
    const { commands } = registerCommands();
    const { ctx, customRenders } = createContext({
      workspace: "ws_123",
      secret: "cancel",
    });

    await requireCommand(commands, "opencode-go:setup").handler("", ctx);

    const cookieScreen = (customRenders[1] ?? []).join("\n");
    expect(cookieScreen).toContain("Step 2/2");
    expect(cookieScreen).toContain("Application");
    expect(cookieScreen).toContain("Cookies");
    expect(cookieScreen).toContain("auth");
    expect(cookieScreen).toContain("only the auth value");
  });

  it("stops after the first screen when workspace input is cancelled", async () => {
    const { commands, dependencies, emitted } = registerCommands();
    const { ctx, confirm, input, custom } = createContext();

    await requireCommand(commands, "opencode-go:setup").handler("", ctx);

    expect(confirm).not.toHaveBeenCalled();
    expect(input).not.toHaveBeenCalled();
    expect(custom).toHaveBeenCalledOnce();
    expect(dependencies.validate).not.toHaveBeenCalled();
    expect(dependencies.save).not.toHaveBeenCalled();
    expect(emitted).toEqual([]);
  });

  it("does nothing when secret input is cancelled", async () => {
    const { commands, dependencies, emitted } = registerCommands();
    const { ctx, custom } = createContext({
      workspace: "ws_123",
      secret: "cancel",
    });

    await requireCommand(commands, "opencode-go:setup").handler("", ctx);

    expect(custom).toHaveBeenCalledTimes(2);
    expect(dependencies.validate).not.toHaveBeenCalled();
    expect(dependencies.save).not.toHaveBeenCalled();
    expect(emitted).toEqual([]);
  });

  it("does nothing when clear confirmation is declined", async () => {
    const { commands, dependencies, emitted } = registerCommands();
    const { ctx, confirm } = createContext({ confirm: false });

    await requireCommand(commands, "opencode-go:clear").handler("", ctx);

    expect(confirm).toHaveBeenCalledOnce();
    expect(dependencies.clear).not.toHaveBeenCalled();
    expect(emitted).toEqual([]);
  });
});

describe("OpenCode Go setup command behavior", () => {
  it("repeats the cookie lookup path in the masked prompt", async () => {
    const { commands } = registerCommands();
    const { ctx, customRenders } = createContext({
      workspace: "ws_123",
      secret: "cancel",
    });

    await requireCommand(commands, "opencode-go:setup").handler("", ctx);

    const prompt = customRenders.flat().join("\n");
    expect(prompt).toContain("Application");
    expect(prompt).toContain("Cookies");
    expect(prompt).toContain("auth");
  });

  it("rejects invalid workspace input before asking for a cookie", async () => {
    const { commands, dependencies } = registerCommands();
    const { ctx, custom, notify } = createContext({
      workspace: "https://evil.example/workspace/ws_123/go",
    });

    await requireCommand(commands, "opencode-go:setup").handler("", ctx);

    expect(custom).toHaveBeenCalledOnce();
    expect(dependencies.validate).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.any(String), "error");
  });

  it("does not expose a secret when custom UI is unavailable", async () => {
    const { commands, dependencies } = registerCommands();
    const { ctx, notify } = createContext({
      workspace: "ws_123",
      secret: "unavailable",
    });

    await requireCommand(commands, "opencode-go:setup").handler("", ctx);

    expect(dependencies.validate).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("interactive"),
      "error",
    );
  });

  it("validates before saving and never includes the cookie in notifications", async () => {
    const { commands, dependencies, emitted } = registerCommands();
    const secret = "super-secret-cookie";
    const { ctx, notify } = createContext({
      workspace: "https://opencode.ai/workspace/ws_123/go",
      secret: `auth=${secret}; theme=dark`,
    });

    await requireCommand(commands, "opencode-go:setup").handler("", ctx);

    const normalized = { workspaceId: "ws_123", authCookie: secret };
    expect(dependencies.validate).toHaveBeenCalledWith(normalized);
    expect(dependencies.save).toHaveBeenCalledWith(normalized);
    expect(dependencies.validate.mock.invocationCallOrder[0]).toBeLessThan(
      dependencies.save.mock.invocationCallOrder[0]!,
    );
    expect(dependencies.clearConfigCache).toHaveBeenCalledOnce();
    expect(dependencies.clearQuotaCache).toHaveBeenCalledOnce();
    expect(emitted).toContainEqual({
      channel: "quotas:provider-config:updated",
      data: { provider: "opencode-go" },
    });
    expect(JSON.stringify(notify.mock.calls)).not.toContain(secret);
  });

  it("does not save when dashboard validation fails", async () => {
    const dependencies = createDependencies({
      validate: vi.fn(async () => ({
        success: false as const,
        error: "OpenCode Go dashboard error 401",
      })),
    });
    const { commands, emitted } = registerCommands(dependencies);
    const secret = "rejected-secret-cookie";
    const { ctx, notify } = createContext({
      workspace: "ws_123",
      secret,
    });

    await requireCommand(commands, "opencode-go:setup").handler("", ctx);

    expect(dependencies.save).not.toHaveBeenCalled();
    expect(emitted).toEqual([]);
    expect(notify).toHaveBeenCalledWith(expect.any(String), "error");
    expect(JSON.stringify(notify.mock.calls)).not.toContain(secret);
  });

  it("requests a fresh cookie for structured authorization failures", async () => {
    const dependencies = createDependencies({
      validate: vi.fn(async () => ({
        success: false as const,
        status: 403,
        error: "dashboard request denied",
      })),
    });
    const { commands } = registerCommands(dependencies);
    const { ctx, notify } = createContext({
      workspace: "ws_123",
      secret: "rejected-secret-cookie",
    });

    await requireCommand(commands, "opencode-go:setup").handler("", ctx);

    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("fresh auth cookie"),
      "error",
    );
    expect(dependencies.save).not.toHaveBeenCalled();
  });

  it("warns when environment variables override the managed file", async () => {
    const dependencies = createDependencies({
      resolveEnv: vi.fn(() => ({
        state: "configured" as const,
        source: "env",
        config: { workspaceId: "ws_env", authCookie: "env-secret" },
      })),
    });
    const { commands } = registerCommands(dependencies);
    const { ctx, notify } = createContext({
      workspace: "ws_123",
      secret: "saved-secret",
    });

    await requireCommand(commands, "opencode-go:setup").handler("", ctx);

    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("environment"),
      "warning",
    );
    expect(JSON.stringify(notify.mock.calls)).not.toContain("env-secret");
  });
});

describe("OpenCode Go clear command behavior", () => {
  it("clears the managed file and refreshes provider state", async () => {
    const { commands, dependencies, emitted } = registerCommands();
    const { ctx, notify } = createContext({ confirm: true });

    await requireCommand(commands, "opencode-go:clear").handler("", ctx);

    expect(dependencies.clear).toHaveBeenCalledOnce();
    expect(dependencies.clearConfigCache).toHaveBeenCalledOnce();
    expect(dependencies.clearQuotaCache).toHaveBeenCalledOnce();
    expect(emitted).toContainEqual({
      channel: "quotas:provider-config:updated",
      data: { provider: "opencode-go" },
    });
    expect(notify).toHaveBeenCalledWith(expect.any(String), "info");
  });
});
