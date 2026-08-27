# OpenCode Go setup and active-provider footer design

## Context

OpenCode Go model authentication and quota authentication are separate. Pi can call OpenCode Go models with the API key stored by `/login opencode-go`, while the dashboard quota endpoint needs a workspace ID and the dashboard's `auth` cookie. The extension currently requires users to create a JSON file or set environment variables manually. Its footer already uses Pi's native `ctx.ui.setStatus()` API, but the active-provider behavior needs to be made explicit and robust across model switches and transient failures.

## Goals

- Add an interactive `/opencode-go:setup` command that accepts a full workspace URL or a raw workspace ID, collects the dashboard cookie through a masked custom input, validates both values against the quota endpoint, and persists them only after successful validation.
- Add `/opencode-go:clear` to remove the saved dashboard credential after an explicit confirmation.
- Keep the footer as a single active-provider status: show quota or balance information only for the provider backing the current model.
- Continue showing useful current-provider information for pay-as-you-go providers such as OpenRouter, even though they are not subscription plans.
- Never display all configured providers in the footer and never pin OpenCode Go independently of the selected model.

## Setup flow and credential storage

`/opencode-go:setup` first explains that the model API key is already managed separately by `/login opencode-go`. It accepts either `https://opencode.ai/workspace/<id>/go` or `<id>`, normalizes the input, and rejects unrelated hosts, paths, empty IDs, and control characters. It then opens a custom focused input component that masks every cookie character and supports paste, editing, cancellation, and submission without placing the secret in notifications or session entries.

The command calls the existing OpenCode Go quota client with the candidate values. A failed validation produces a sanitized actionable error and writes nothing. A successful validation atomically writes `~/.config/opencode/opencode-quota/opencode-go.json`, attempts owner-only permissions where supported, clears the in-memory configuration and quota caches, and triggers an immediate footer refresh when OpenCode Go is the active provider. The command reports only the workspace ID and validation outcome, never the cookie. Environment variables retain higher precedence and the command warns when they would override the saved file.

`/opencode-go:clear` confirms intent, removes only the plugin-managed file, clears related caches, and refreshes the active footer. It does not remove Pi's OpenCode Go API key.

## Active-provider footer

The existing native Pi footer integration remains in place; the extension must not call `ctx.ui.setFooter()` because replacing the complete footer would hide built-in directory, context, token, model, and third-party status information. A single quota status is derived from `ctx.model.provider` and contains an explicit compact provider label, followed by that provider's useful quota windows or balance. Examples include `Codex 5h:82% 7d:91%`, `GLM CN tokens:76%`, `Grok weekly:68%`, `Go 5h:65% wk:38% mo:72%`, and an OpenRouter balance or budget summary.

On `model_select`, the extension invalidates the previous provider generation immediately so an in-flight request cannot overwrite the new status. It clears data belonging to the old provider, then fetches the newly active provider. `turn_end` and a 60-second timer refresh the same provider. Existing quota caching prevents duplicate network requests. Unsupported, unconfigured, and successful-but-empty providers leave the quota status absent rather than displaying irrelevant setup errors.

For a transient network or server failure, the footer may retain the last successful result only when it belongs to the same active provider, adding a dim `~` stale marker. Authentication and configuration failures replace data with a short provider-specific action such as `Go: setup required` or `Go: login required`; they are not repeated as notifications. Switching providers always discards the prior provider's last-known value.

## Settings and compatibility

No `pinnedProviders` or multi-provider footer setting will be introduced. `/quotas:settings` continues to expose the existing footer toggle, renamed or described clearly as “current provider quota status.” The combined `/quotas` dashboard remains the place to inspect every configured subscription. The setup commands are provider-specific and remain available even when provider quota commands are disabled, because they manage credentials rather than dashboard visibility.

The feature uses one status key and compact formatting so Pi's built-in footer truncation behaves predictably on narrow terminals. It preserves the existing Synthetic de-duplication behavior and does not replace statuses owned by other extensions.

## Testing

Unit tests cover workspace URL and ID normalization, hostile or malformed inputs, secret redaction, atomic save and clear behavior, environment-variable precedence, cache invalidation, and sanitized validation failures. Footer tests cover provider labels, supported subscription and pay-as-you-go formats, active-model switching, stale same-provider data, rejection of stale cross-provider requests, authentication failures, empty or unsupported providers, timer coalescing, Synthetic de-duplication, and narrow status output. Integration-level command tests use fake credentials and mocked HTTP responses; real cookies must never appear in fixtures or snapshots.

The completed implementation must pass the focused tests, the full Vitest suite, type checking, linting, and `git diff --check` before installation from an exact fork commit.
