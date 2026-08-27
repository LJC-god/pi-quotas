# ZAI Coding CN Quota Support Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Make `@latentminds/pi-quotas` monitor Pi's `zai-coding-cn` subscription through the China-region quota endpoint without mixing global and China credentials.

**Architecture:** Register `zai-coding-cn` as a separate supported provider. Reuse the ZAI response parser with an explicit provider identity, while keeping endpoint and authorization-header construction in region-specific fetchers.

**Tech Stack:** TypeScript, Pi `AuthStorage`, Fetch API, Vitest, ESLint, TypeScript compiler

---

### Task 0: Integrate the existing feature commits

**Files:**
- Merge: commits `5dc5318` and `29dff7c`

**Step 1: Cherry-pick Grok support**

Run: `git cherry-pick 5dc5318`

Expected: the verified Grok provider change applies cleanly.

**Step 2: Cherry-pick inactive-provider filtering**

Run: `git cherry-pick 29dff7c`

Expected: the verified dashboard filtering change applies cleanly; retain both README additions if conflict resolution is required.

**Step 3: Run the combined baseline**

Run: `npm test`

Expected: both existing feature suites pass together before China-provider work starts.

### Task 1: Register the China provider and command

**Files:**
- Modify: `src/types/quotas.ts`
- Modify: `src/lib/quotas.ts`
- Modify: `src/extensions/command-quotas/provider-commands.ts`
- Test: `src/extensions/command-quotas/provider-commands.test.ts`

**Step 1: Write the failing test**

Add a command-metadata assertion for `zai-coding-cn` expecting command name `zai-cn:quotas` and title `GLM China Quotas`.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/extensions/command-quotas/provider-commands.test.ts`

Expected: FAIL because `zai-coding-cn` is not a supported provider and has no command mapping.

**Step 3: Write minimal implementation**

Add `zai-coding-cn` to `SupportedQuotaProvider`, `SUPPORTED_PROVIDERS`, `PROVIDER_LABELS`, `PROVIDER_TTLS_MS`, and `getProviderCommandInfo`.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/extensions/command-quotas/provider-commands.test.ts`

Expected: PASS.

### Task 2: Preserve provider identity in ZAI parsing

**Files:**
- Modify: `src/providers/providers.ts`
- Test: `src/providers/parse.test.ts`

**Step 1: Write the failing test**

Parse a representative quota response as `zai-coding-cn` and assert every returned window carries that provider.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/providers/parse.test.ts`

Expected: FAIL because `parseZaiUsage` currently hard-codes `zai`.

**Step 3: Write minimal implementation**

Give `parseZaiUsage` an optional provider argument defaulting to `zai`, and use it for every generated window.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/providers/parse.test.ts`

Expected: PASS while existing global parsing assertions remain green.

### Task 3: Fetch China-region quotas safely

**Files:**
- Modify: `src/providers/fetch.ts`
- Test: `src/providers/fetch.test.ts`

**Step 1: Write the failing tests**

Assert that the China token helper returns a config error without a key, calls `open.bigmodel.cn` with a raw `Authorization` header, parses successful windows as `zai-coding-cn`, and that the storage-based fetcher requests only the `zai-coding-cn` credential.

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/providers/fetch.test.ts`

Expected: FAIL because the China fetch helpers and provider fetcher do not exist.

**Step 3: Write minimal implementation**

Add `fetchZaiCodingCnQuotasWithToken` and `fetchZaiCodingCnQuotas`, include `Accept-Language: en-US,en`, and register the fetcher in `PROVIDER_FETCHERS`. Do not alter the global endpoint or Bearer behavior.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/providers/fetch.test.ts`

Expected: PASS.

### Task 4: Document and integrate

**Files:**
- Modify: `README.md`

**Step 1: Update documentation**

Add `GLM China`, `/zai-cn:quotas`, the `zai-coding-cn` auth entry, regional endpoint behavior, and the rule that configured global and China accounts appear separately.

**Step 2: Run the complete verification suite**

Run: `npm test`, `npm run typecheck`, `npm run lint`, `git diff --check`, and `git show --check`.

Expected: every command exits 0 with no test failures or whitespace errors.

**Step 3: Commit**

Commit the China-provider implementation and documentation as `feat: support ZAI Coding CN quotas`.
