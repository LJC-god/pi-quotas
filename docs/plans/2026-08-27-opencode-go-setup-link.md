# OpenCode Go Setup Link Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Make `/opencode-go:setup` show a clickable OpenCode account link and precise credential acquisition instructions before collecting any input.

**Architecture:** Add one confirmation-based setup guide in the existing command module. It displays static, non-secret instructions and gates the unchanged workspace/cookie validation and persistence flow; no browser process or new dependency is introduced.

**Tech Stack:** TypeScript, Pi extension UI API, Vitest, ESLint.

---

### Task 1: Specify the setup guide behavior

**Files:**
- Modify: `src/extensions/command-quotas/opencode-go-commands.test.ts`

**Step 1: Write the failing content test**

Add a test that runs the setup command and asserts the first confirmation message contains:

```text
https://opencode.ai/auth
https://opencode.ai/workspace/<workspace-id>/go
auth
Application
Cookies
```

Also assert the guide is requested before the workspace input.

**Step 2: Write the failing cancellation test**

Decline the setup guide and assert that workspace input, masked input, validation, save, and provider refresh are untouched.

**Step 3: Run the focused test and verify RED**

Run: `npm test -- src/extensions/command-quotas/opencode-go-commands.test.ts`

Expected: the new assertions fail because setup currently starts with workspace input and has no guide.

### Task 2: Implement the minimal guide

**Files:**
- Modify: `src/extensions/command-quotas/opencode-go-commands.ts`
- Test: `src/extensions/command-quotas/opencode-go-commands.test.ts`

**Step 1: Add a private guide function**

Use `ctx.ui.confirm()` with static text that explains the two required values, the `F12 -> Application -> Storage -> Cookies` path, and the instruction to copy only the `auth` value.

**Step 2: Gate the setup flow**

Call the guide at the beginning of the setup handler and return immediately when it is declined.

**Step 3: Repeat the short cookie path in masked input**

Add a dim line to the masked dialog without displaying or retaining the supplied secret.

**Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/extensions/command-quotas/opencode-go-commands.test.ts`

Expected: all focused tests pass.

**Step 5: Commit**

```bash
git add src/extensions/command-quotas/opencode-go-commands.ts src/extensions/command-quotas/opencode-go-commands.test.ts
git commit -m "feat: guide OpenCode Go quota setup"
```

### Task 3: Document and deliver

**Files:**
- Modify: `README.md`

**Step 1: Update the usage note**

Document that the command shows `https://opencode.ai/auth`, lists the workspace URL and `auth` cookie requirements, and does not launch the browser.

**Step 2: Run complete verification**

Run:

```bash
npm test
npm run typecheck
npm run lint
git diff --check
```

Expected: zero failures or errors.

**Step 3: Commit, push, and install**

Commit the documentation, push `integration/grok-active-zai-cn`, install the resulting exact SHA through `pi install`, and verify the settings entry, installed HEAD, and remote branch all match.
