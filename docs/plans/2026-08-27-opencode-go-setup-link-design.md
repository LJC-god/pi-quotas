# OpenCode Go setup link design

## Context and goal

The existing `/opencode-go:setup` command starts by asking for a workspace URL or ID. That assumes the user already knows which dashboard page to visit and which browser credential the quota endpoint requires. The command should instead explain the complete preparation step before asking for input, while respecting the user's choice not to launch a browser automatically.

## Interaction

The command first shows a confirmation dialog containing the stable OpenCode account entry point, `https://opencode.ai/auth`. It identifies the two required values: the full Go workspace page URL in the form `https://opencode.ai/workspace/<workspace-id>/go`, and only the value of the `auth` cookie for `https://opencode.ai`. The instructions explain how to find the cookie in browser developer tools through `Application` / `Storage` / `Cookies`, and explicitly warn against copying all cookies.

The URL remains plain HTTPS text so terminals such as Windows Terminal can expose it through Ctrl+click without the plugin spawning a browser process. The dialog offers Continue and Cancel through Pi's existing confirmation primitive. Cancel exits before the workspace prompt and does not validate, persist, or emit a refresh event. Continue enters the existing workspace and masked-cookie flow unchanged.

The masked cookie dialog repeats a short browser path so the user does not need to remember the earlier instructions. It continues to state that the value is masked and never written to session history. No credential is copied to notifications, command arguments, session messages, logs, or tests.

## Architecture and compatibility

The change stays inside `opencode-go-commands.ts`: exported constants are unnecessary, browser launching is deliberately excluded, and no platform-specific dependency is introduced. A private guide function owns the static copy and returns the confirmation result. Existing dependency injection and validation/storage behavior remain unchanged.

## Testing

Command tests verify that the first dialog contains the official link, both required values, the cookie lookup path, and the limited-cookie warning. A cancellation test proves no later input, validation, save, or event occurs. Existing success, validation, masking, environment precedence, and clear-command tests continue to pass. Final verification includes the complete Vitest suite, type checking, linting, and `git diff --check`.
