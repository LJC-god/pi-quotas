# OpenCode Go two-step guided setup design

## Context and goal

The first guidance revision added a confirmation page before the existing workspace and cookie prompts. Although it exposed the right information, it made the flow less intuitive by separating instructions from the fields they explain. The setup must instead have exactly two screens, with each screen combining its guidance and input.

## Step 1: workspace

The first focused input screen is titled `OpenCode Go - Step 1/2: Workspace`. It displays the plain HTTPS account entry point `https://opencode.ai/auth`, tells the user to sign in and enter the Go workspace page, and shows the expected address format `https://opencode.ai/workspace/<workspace-id>/go`. The input directly below accepts either that complete URL or the raw workspace ID, preserving the existing normalization and host/path safety checks.

There is no preceding confirmation dialog. Enter advances to the cookie screen only after a value is supplied; Escape cancels the command before any credential is validated or saved. The plugin does not launch a browser or copy anything automatically.

## Step 2: cookie

The second focused input screen is titled `OpenCode Go - Step 2/2: auth Cookie`. It shows the browser path `F12 > Application > Storage > Cookies > https://opencode.ai > auth > Value`, instructs the user to copy only the Value rather than all cookies, and places the masked input directly underneath. Enter runs the unchanged validation-and-save flow; Escape cancels without persistence.

The cookie remains masked during paste and editing and is never placed in command arguments, notifications, logs, or Pi session history. Validation errors continue to be sanitized.

## Architecture

A small private guided-input helper in `opencode-go-commands.ts` owns the shared custom TUI behavior. It receives a title, instruction lines, and whether the underlying Pi `Input` should be plain or `MaskedInput`. Workspace and cookie wrappers supply their own copy and input type. This avoids duplicated focus, submit, Escape, render, and disposal logic while keeping the flow explicitly two-stage.

The clear command retains its confirmation dialog. Only setup removes `confirm()`. Existing normalization, validation, atomic storage, cache invalidation, environment precedence, and footer refresh behavior stay unchanged.

## Testing

Command tests verify that setup never calls the confirmation primitive, creates exactly two custom inputs in order, renders the account link and workspace format on the first, and renders the browser cookie path and limited-copy warning on the second. Cancellation is covered independently at both steps. Existing validation, secret redaction, persistence, failure, environment, and clear-command tests remain green. Final delivery requires the complete Vitest suite, type checking, linting, `git diff --check`, package inspection, fork push, and exact-SHA installation verification.
