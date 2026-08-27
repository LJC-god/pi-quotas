# Bright Provider Colours Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Give every `/usage` provider block a distinct bright colour and remove white/grey quota rows.

**Architecture:** Keep the static data and layout unchanged. Replace the provider palette and apply each provider's ANSI prefix to every line in its block; retain the dim fetched timestamp.

**Tech Stack:** TypeScript, ANSI terminal colours, Vitest, Pi TUI, npm.

---

### Task 1: Colour complete provider blocks

**Files:**
- Modify: `src/extensions/command-quotas/static-display.test.ts`
- Modify: `src/extensions/command-quotas/static-display.ts`

**Step 1: Write the failing tests**

Render all supported providers with one quota window each. Extract the ANSI colour from each heading and require ten unique colours, none equal to white or grey. Require each provider's window line to start with the same colour as its heading.

**Step 2: Verify RED**

Run: `npx vitest run src/extensions/command-quotas/static-display.test.ts`

Expected: FAIL because Codex is white, Grok is grey, Z.ai/GLM and OpenCode Go/Kimi share colours, and window rows are uncoloured.

**Step 3: Implement the minimal change**

Replace `PROVIDER_COLORS` with ten bright unique RGB values. Build each provider block as plain lines, then wrap every block line with its provider ANSI prefix and reset sequence. Keep the fetched timestamp dim.

**Step 4: Verify GREEN and commit**

Run the focused test, then commit the renderer and tests.

### Task 2: Release and install 0.5.2

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `package-lock.json`

**Step 1:** Document the provider palette and bump to `0.5.2`.

**Step 2:** Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm pack --dry-run --json`.

**Step 3:** Load the worktree extension in Pi and visually confirm that headings and quota rows are bright and provider-specific.

**Step 4:** Push the feature branch and public main, publish `@timiliang/pi-quotas@0.5.2`, push `v0.5.2`, install it locally, and verify the old version is absent.
