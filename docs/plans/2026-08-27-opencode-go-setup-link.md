# OpenCode Go Two-Step Guided Setup Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Replace the separate OpenCode Go guidance confirmation with exactly two self-explanatory input screens for workspace and cookie.

**Architecture:** Use one private custom-input renderer backed by Pi's plain `Input` for workspace and the existing `MaskedInput` for the cookie. Keep all normalization, validation, persistence, and refresh behavior unchanged.

**Tech Stack:** TypeScript, Pi TUI, Pi extension UI API, Vitest, ESLint.

---

### Task 1: Specify the corrected two-step flow

**Files:**
- Modify: `src/extensions/command-quotas/opencode-go-commands.test.ts`

**Step 1: Rewrite the test UI driver**

Make the fake custom UI submit a workspace value on its first invocation and a cookie value on its second invocation, while retaining Escape and unavailable-mode coverage.

**Step 2: Write failing interaction tests**

Assert that setup never calls `ctx.ui.confirm()`, invokes custom UI twice in order, renders `https://opencode.ai/auth` and the workspace URL pattern on screen one, and renders `Application`, `Cookies`, `auth`, and the copy-only warning on screen two.

**Step 3: Write failing cancellation tests**

Assert that Escape on step one prevents step two, and Escape on step two prevents validation and saving.

**Step 4: Verify RED**

Run: `npm test -- src/extensions/command-quotas/opencode-go-commands.test.ts`

Expected: failures show that setup still uses a confirmation page and the workspace field is not a guided custom input.

### Task 2: Implement the two guided inputs

**Files:**
- Modify: `src/extensions/command-quotas/opencode-go-commands.ts`
- Test: `src/extensions/command-quotas/opencode-go-commands.test.ts`

**Step 1: Add the shared input helper**

Import Pi's `Input`, build a private guided custom component, and parameterize its title, instruction lines, and masked state.

**Step 2: Add workspace and cookie wrappers**

Screen one supplies the account link and workspace URL format with plain input. Screen two supplies the developer-tools path and warning with masked input.

**Step 3: Remove the standalone setup confirmation**

Call the workspace prompt directly, handle Escape/unavailable results, then call the cookie prompt. Leave `/opencode-go:clear` confirmation unchanged.

**Step 4: Verify GREEN and commit**

Run: `npm test -- src/extensions/command-quotas/opencode-go-commands.test.ts`

Expected: all focused tests pass.

Commit: `fix: make OpenCode Go setup a guided two-step flow`

### Task 3: Document and deliver

**Files:**
- Modify: `README.md`

**Step 1: Correct the README**

Describe the two inline guided screens and remove wording that implies a separate pre-input page.

**Step 2: Verify the complete tree**

Run `npm test`, `npm run typecheck`, `npm run lint`, `git diff --check`, and `npm pack --dry-run --json`.

**Step 3: Push and install**

Push `integration/grok-active-zai-cn`, install the resulting exact commit, and verify settings, installed HEAD, worktree HEAD, and remote SHA are identical.
