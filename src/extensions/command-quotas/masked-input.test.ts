import { describe, expect, it, vi } from "vitest";
import { MaskedInput } from "./masked-input.js";

describe("MaskedInput", () => {
  it("keeps typed text while rendering only mask characters", () => {
    const input = new MaskedInput();
    const secret = "secret-cookie-value";

    input.handleInput(secret);
    const rendered = input.render(80).join("\n");

    expect(input.getValue()).toBe(secret);
    expect(rendered).not.toContain(secret);
    expect(rendered.match(/•/gu)).toHaveLength(secret.length);
  });

  it("supports bracketed paste without rendering the pasted secret", () => {
    const input = new MaskedInput();
    const secret = "pasted-secret";

    input.handleInput(`\u001b[200~${secret}\u001b[201~`);

    expect(input.getValue()).toBe(secret);
    expect(input.render(80).join("\n")).not.toContain(secret);
  });

  it("submits the unmasked value", () => {
    const input = new MaskedInput();
    const onSubmit = vi.fn();
    input.onSubmit = onSubmit;
    input.handleInput("secret-cookie");

    input.handleInput("\n");

    expect(onSubmit).toHaveBeenCalledWith("secret-cookie");
  });

  it("supports cancellation", () => {
    const input = new MaskedInput();
    const onEscape = vi.fn();
    input.onEscape = onEscape;

    input.handleInput("\u001b");

    expect(onEscape).toHaveBeenCalledOnce();
  });
});
