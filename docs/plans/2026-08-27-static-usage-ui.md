# Static Usage UI Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Replace the interactive quota dashboard with an old-style compact transcript entry, add `/usage`, and make the active-provider footer ASCII-safe.

**Architecture:** Commands fetch the existing quota snapshots, serialize them into a safe custom-entry payload, and append the payload through Pi. A pure formatter renders the persisted payload as compact ANSI text; a feature-detected entry renderer places it in the transcript without LLM context. The current notifier becomes the compatibility fallback for runtimes without entry rendering.

**Tech Stack:** TypeScript, Pi extension API, `@mariozechner/pi-tui` `Text`, Vitest, npm.

---

### Task 1: Add the compact static renderer

**Files:**
- Create: `src/extensions/command-quotas/static-display.ts`
- Create: `src/extensions/command-quotas/static-display.test.ts`

**Step 1: Write the failing tests**

Test a public `renderUsageEntry(data, theme, now)` API with serialized quota data. Assert that a provider heading and every window occupy one line, the bar is ten cells, counts and currency are retained, reset text survives ISO serialization, errors are one line, and empty data says `No active quota subscriptions detected`. Assert the output excludes borders and interactive key hints.

**Step 2: Run the focused test and verify RED**

Run: `npx vitest run src/extensions/command-quotas/static-display.test.ts`

Expected: FAIL because `static-display.ts` does not exist.

**Step 3: Implement the minimal renderer**

Define JSON-safe `UsageEntryData`, `UsageProviderSnapshot`, and `UsageWindow` types. Add `serializeUsageEntry(snapshots, fetchedAt)` to map reset dates to ISO strings without retaining credentials. Add `renderUsageEntry` using provider colours, an aligned 18-character label field, a ten-cell `█/░` bar, old-style elapsed-window pie glyphs, formatted values, reset timing, and a dim fetched timestamp.

**Step 4: Run the focused test and verify GREEN**

Run: `npx vitest run src/extensions/command-quotas/static-display.test.ts`

Expected: all static-display tests pass.

**Step 5: Commit**

```bash
git add src/extensions/command-quotas/static-display.ts src/extensions/command-quotas/static-display.test.ts
git commit -m "feat: add compact static quota renderer"
```

### Task 2: Replace interactive commands with transcript entries

**Files:**
- Modify: `src/extensions/command-quotas/command.ts`
- Modify: `src/extensions/command-quotas/command.test.ts`
- Delete: `src/extensions/command-quotas/components/quotas-display.ts`
- Delete: `src/extensions/command-quotas/components/quotas-display.test.ts`

**Step 1: Write the failing command tests**

Mock provider fetching and register commands against an API recorder. Assert that `registerQuotasCommands` registers `/usage`, `/quotas`, provider commands, and the `provider-usage` entry renderer; `/usage` appends a filtered JSON-safe entry; `/usage --refresh` requests forced refresh; invalid arguments notify with command help; `/quotas` uses the same handler; and a provider command appends its diagnostic result. Add a fallback assertion for a runtime without `registerEntryRenderer`.

**Step 2: Run the focused test and verify RED**

Run: `npx vitest run src/extensions/command-quotas/command.test.ts`

Expected: FAIL because `/usage` and the entry renderer are not registered and the command still invokes `ctx.ui.custom`.

**Step 3: Implement the command path**

Remove `openQuotaView` and all `QuotasComponent` imports. Register a feature-detected `provider-usage` renderer returning `new Text(renderUsageEntry(...), 0, 0)`. Add a shared handler that parses only an optional `--refresh`, fetches snapshots, applies `filterDashboardSnapshots` for combined views, serializes them, and either appends the entry or sends the compact fallback notification. Register both `usage` and `quotas` with the combined handler. Keep OpenCode Go setup commands independent.

**Step 4: Delete the obsolete interactive component and run tests**

Run: `npx vitest run src/extensions/command-quotas/command.test.ts src/extensions/command-quotas/static-display.test.ts`

Expected: all focused tests pass and no source imports the deleted component.

**Step 5: Commit**

```bash
git add src/extensions/command-quotas
git commit -m "feat: restore static usage transcript output"
```

### Task 3: Make the footer ASCII-safe

**Files:**
- Modify: `src/extensions/usage-status/index.ts`
- Modify: `src/extensions/usage-status/format-status.test.ts`

**Step 1: Write the failing footer tests**

Change expected examples to `Codex | 7d: 87% left (reset in 2h19m) | cap: OK`. Assert the rendered string contains neither `·` nor `↺`, reset-now reads `(reset now)`, and non-reset windows omit reset text.

**Step 2: Run the focused test and verify RED**

Run: `npx vitest run src/extensions/usage-status/format-status.test.ts`

Expected: FAIL because the current output contains the middle dot and return arrow.

**Step 3: Implement minimal ASCII formatting**

Change reset suffixes to `(reset in …)` or `(reset now)` and join window segments with ` | `. Prefix provider labels with ` | ` rather than the middle dot. Keep theme colours and data selection unchanged.

**Step 4: Run the focused test and verify GREEN**

Run: `npx vitest run src/extensions/usage-status/format-status.test.ts`

Expected: all footer formatting tests pass.

**Step 5: Commit**

```bash
git add src/extensions/usage-status/index.ts src/extensions/usage-status/format-status.test.ts
git commit -m "fix: use ASCII quota footer separators"
```

### Task 4: Document and release version 0.5.1

**Files:**
- Modify: `README.md`
- Modify: `package.json`
- Modify: `package-lock.json`

**Step 1: Update user documentation**

Make `/usage` primary, describe `/quotas` as a compatibility alias, replace the interactive dashboard instructions with the transcript behaviour, document `--refresh`, and show the ASCII footer example. Remove statements about `r`, `q`, borders, and the interactive dashboard.

**Step 2: Bump the patch version**

Run: `npm version 0.5.1 --no-git-tag-version`

Expected: package and lockfile versions become `0.5.1`.

**Step 3: Run the complete release gate**

Run: `npm test && npm run typecheck && npm run lint && npm pack --dry-run --json`

Expected: zero failures; the tarball contains the static renderer and excludes the deleted dashboard component.

**Step 4: Commit, push, publish, and tag**

Commit release metadata, fast-forward the public main branch, publish `@timiliang/pi-quotas@0.5.1` with public access against the official registry, verify `npm view`, then create and push annotated tag `v0.5.1`.

**Step 5: Adopt locally and verify**

Back up Pi settings, install `npm:@timiliang/pi-quotas@0.5.1`, remove `git:github.com/LJC-god/pi-usage-meters@41f8cd743042edbe7af525c4e1b44353cecb56e1`, and confirm Pi lists one quota UI package. Verify the installed source contains `/usage`, `registerEntryRenderer`, and ASCII footer markers.
