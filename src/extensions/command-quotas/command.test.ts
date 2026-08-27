import { AuthStorage } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { registerQuotasCommands } from "./command.js";

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
