# OpenCode Go Setup and Active-Provider Footer Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Add safe interactive OpenCode Go dashboard credential setup and make the native Pi quota footer clearly and reliably represent only the currently selected model provider.

**Architecture:** Keep OpenCode Go credential parsing and persistence in the provider configuration module, register two provider-specific commands from the existing quota-command extension, and use a small masked wrapper around Pi TUI's proven single-line `Input`. Extend the current usage-status state machine with provider-labelled last-good state, generation-safe model switching, and same-provider stale fallback; do not replace Pi's footer or fetch multiple providers.

**Tech Stack:** TypeScript ESM, Node.js filesystem APIs, Pi extension API and Pi TUI, Vitest, ESLint, TypeScript.

---

### Task 1: Normalize and persist OpenCode Go dashboard credentials

**Files:**
- Modify: `src/providers/opencode-go-config.ts`
- Create: `src/providers/opencode-go-config.test.ts`

**Step 1: Write failing normalization tests**

Add tests that express the public behavior:

```ts
expect(normalizeOpenCodeGoWorkspaceInput("https://opencode.ai/workspace/ws_123/go")).toBe("ws_123");
expect(normalizeOpenCodeGoWorkspaceInput("ws_123")).toBe("ws_123");
expect(() => normalizeOpenCodeGoWorkspaceInput("https://evil.example/workspace/ws_123/go")).toThrow();
expect(normalizeOpenCodeGoAuthCookieInput("auth=secret; theme=dark")).toBe("secret");
```

**Step 2: Run the tests and verify RED**

Run: `npx vitest run src/providers/opencode-go-config.test.ts`

Expected: FAIL because the normalization exports do not exist.

**Step 3: Implement minimal normalization**

Accept only an HTTPS `opencode.ai/workspace/<id>/go` URL or a safe raw ID. Reject control characters, unrelated URL forms, whitespace, path separators, query strings, and fragments. Accept either the raw cookie value, `auth=<value>`, or a copied cookie header containing an `auth` pair; reject an empty result.

**Step 4: Run the focused test and verify GREEN**

Run: `npx vitest run src/providers/opencode-go-config.test.ts`

Expected: PASS.

**Step 5: Write failing persistence and cache tests**

Use a real temporary directory. Verify `saveOpenCodeGoConfig` creates the managed JSON shape, replaces an existing file, `clearOpenCodeGoConfig` removes only that file, and `clearOpenCodeGoConfigCache` forces a new read. Do not assert on mocked filesystem calls.

**Step 6: Run the tests and verify RED**

Run: `npx vitest run src/providers/opencode-go-config.test.ts`

Expected: FAIL because save, clear, managed-path, and cache-clear functions do not exist.

**Step 7: Implement atomic persistence and cache invalidation**

Write a same-directory temporary file with mode `0o600`, rename it over the managed file, best-effort `chmod` the result, and remove a leftover temporary file after failure. Return the managed path from save and a boolean from clear. Export an explicit in-memory cache reset.

**Step 8: Run focused tests and commit**

Run: `npx vitest run src/providers/opencode-go-config.test.ts`

Expected: PASS.

Commit: `feat: manage OpenCode Go quota credentials`

### Task 2: Add a masked secret input component

**Files:**
- Create: `src/extensions/command-quotas/masked-input.ts`
- Create: `src/extensions/command-quotas/masked-input.test.ts`

**Step 1: Write the failing component tests**

Instantiate the wished-for component, type and paste a fake secret, and verify `getValue()` retains it while every rendered line excludes it and contains only mask characters. Verify submit and escape callbacks.

**Step 2: Run the tests and verify RED**

Run: `npx vitest run src/extensions/command-quotas/masked-input.test.ts`

Expected: FAIL because `MaskedInput` does not exist.

**Step 3: Implement the smallest wrapper around Pi TUI `Input`**

Subclass `Input`, reuse its editing, paste, undo, submit, and escape behavior, and override only `render()`. Temporarily substitute an equal-length bullet string inside `try/finally`, delegate rendering to `Input`, and restore the real value before returning. The secret must never be returned by `render()`.

**Step 4: Run focused tests and commit**

Run: `npx vitest run src/extensions/command-quotas/masked-input.test.ts`

Expected: PASS.

Commit: `feat: add masked extension input`

### Task 3: Register setup and clear commands

**Files:**
- Create: `src/extensions/command-quotas/opencode-go-commands.ts`
- Create: `src/extensions/command-quotas/opencode-go-commands.test.ts`
- Modify: `src/extensions/command-quotas/command.ts`
- Modify: `src/config.ts`

**Step 1: Write failing command-registration and cancellation tests**

Verify `opencode-go:setup` and `opencode-go:clear` are always registered independently of dashboard/provider command toggles. Verify cancellation at workspace, secret, and clear-confirmation steps writes and deletes nothing.

**Step 2: Run the tests and verify RED**

Run: `npx vitest run src/extensions/command-quotas/opencode-go-commands.test.ts src/extensions/command-quotas/command.test.ts`

Expected: FAIL because the commands and provider-config event do not exist.

**Step 3: Implement the command shell and masked prompt**

Register both commands unconditionally. Use `ctx.ui.input` for the workspace URL/ID, `ctx.ui.custom` with `MaskedInput` for the cookie, and `ctx.ui.confirm` before clear. If custom UI is unavailable, stop with a safe message rather than falling back to visible secret input.

**Step 4: Write failing validation, persistence, redaction, and event tests**

Drive the real command flow with fake external validation/persistence dependencies. Verify failed validation writes nothing, successful validation saves normalized values, no notification contains the fake cookie, environment override produces a warning, and successful setup/clear emits `quotas:provider-config:updated` for `opencode-go` after clearing both caches.

**Step 5: Run the tests and verify RED**

Run: `npx vitest run src/extensions/command-quotas/opencode-go-commands.test.ts`

Expected: FAIL on the first missing behavior.

**Step 6: Implement validation and side effects**

Call `queryOpenCodeGoQuota` with candidate credentials. Convert 401/403 into a fresh-cookie action and sanitize all other messages. Persist only on success, never notify or emit the cookie, warn if environment variables override the managed file, clear the OpenCode config and quota caches, and emit the generic provider-config update event.

**Step 7: Run focused tests and commit**

Run: `npx vitest run src/extensions/command-quotas/opencode-go-commands.test.ts src/extensions/command-quotas/command.test.ts`

Expected: PASS.

Commit: `feat: add OpenCode Go quota setup commands`

### Task 4: Label and stabilize the active-provider footer

**Files:**
- Modify: `src/extensions/usage-status/index.ts`
- Modify: `src/extensions/usage-status/index.test.ts`
- Modify: `src/extensions/usage-status/format-status.test.ts`

**Step 1: Write failing provider-label formatting tests**

Require each supported provider to have a compact footer label, including `Codex`, `GLM CN`, `Grok`, `Go`, and `OpenRouter`. Require successful OpenRouter budget/balance windows to remain visible.

**Step 2: Run the tests and verify RED**

Run: `npx vitest run src/extensions/usage-status/format-status.test.ts`

Expected: FAIL because the status has no provider prefix.

**Step 3: Add provider-labelled formatting**

Make `formatStatusForFooter` receive the active provider and prepend a compact, themed label. Preserve existing window value, severity, reset, currency, and count formatting.

**Step 4: Write failing model-switch and stale-state tests**

Use controllable provider promises to prove that model selection clears old-provider output immediately, an old in-flight request cannot overwrite the new provider, a transient same-provider failure retains its last-good text with `~`, and a transient failure without last-good data shows a compact unavailable message. Verify unsupported and not-applicable providers clear the status.

**Step 5: Run the tests and verify RED**

Run: `npx vitest run src/extensions/usage-status/index.test.ts`

Expected: FAIL on provider-aware state behavior.

**Step 6: Implement provider-aware last-good state**

Store `{ provider, windows }`, invalidate it on provider changes, and retain it only for transient failures of the same provider. Keep generation checks around every asynchronous write. For OpenCode Go configuration failures show `Go: setup required`; keep unrelated unconfigured/non-subscription providers silent. Listen for `quotas:provider-config:updated`, and immediately refresh only when the payload provider is active.

**Step 7: Run focused tests and commit**

Run: `npx vitest run src/extensions/usage-status/index.test.ts src/extensions/usage-status/format-status.test.ts`

Expected: PASS.

Commit: `feat: stabilize active provider quota footer`

### Task 5: Harden OpenCode Go HTTP errors and documentation

**Files:**
- Modify: `src/providers/opencode-go.ts`
- Create or modify: `src/providers/opencode-go.test.ts`
- Modify: `README.md`
- Modify: `src/config.ts`

**Step 1: Write failing HTTP-error tests**

Verify the quota client exposes the HTTP status without including a raw response body, classifies timeout/cancellation safely, and never includes the submitted cookie in errors.

**Step 2: Run the tests and verify RED**

Run: `npx vitest run src/providers/opencode-go.test.ts`

Expected: FAIL because structured status is absent or the raw body remains.

**Step 3: Implement safe structured errors**

Add an optional numeric status to failed results and replace response-body snippets with bounded status-based messages. Preserve successful scraping behavior.

**Step 4: Update user-facing documentation**

Document `/opencode-go:setup`, `/opencode-go:clear`, API-key versus dashboard-cookie roles, accepted workspace input formats, managed file location, environment precedence, and the current-provider-only footer. Update the settings description to “current provider quota status.”

**Step 5: Run focused tests and commit**

Run: `npx vitest run src/providers/opencode-go.test.ts src/providers/opencode-go-config.test.ts`

Expected: PASS.

Commit: `docs: explain OpenCode Go quota setup`

### Task 6: Full verification, fork update, and exact installation

**Files:**
- Verify all changed files
- Update the user's installed Pi package only after source verification

**Step 1: Run the full automated checks**

Run: `npm test`

Expected: all tests pass.

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run lint`

Expected: exit 0.

Run: `git diff --check`

Expected: exit 0 with no output.

**Step 2: Review requirements and repository state**

Compare the diff against `docs/plans/2026-08-27-opencode-go-setup-active-footer-design.md`, confirm no secret values or unrelated files are present, and confirm the worktree is clean after the final commit.

**Step 3: Push the integration branch to the user's fork**

Push `integration/grok-active-zai-cn` to the configured fork remote and verify the remote SHA with `git ls-remote`.

**Step 4: Back up and update the installed extension**

Preserve current Pi package configuration, install the exact verified fork commit, and run a non-secret smoke check that Pi resolves the new command modules. Do not synthesize or store an OpenCode dashboard cookie.

**Step 5: Report evidence**

Report the exact commit, remote branch, installed spec, test counts, typecheck/lint results, and the commands the user can now run.
