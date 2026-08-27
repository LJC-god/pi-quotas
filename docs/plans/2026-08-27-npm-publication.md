# Public npm Package Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Publish the verified fork as the public package `@timiliang/pi-quotas@0.5.0` and adopt that package locally.

**Architecture:** Rebrand only distribution metadata and documentation while preserving code and upstream attribution. Align the fork's integration branch, default branch, npm artifact, Git tag, and local Pi installation to one immutable commit/version.

**Tech Stack:** npm 11, Git/GitHub, TypeScript, Vitest, Pi package manager.

---

### Task 1: Update distribution identity

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`

**Step 1: Change package metadata**

Set the name to `@timiliang/pi-quotas`, version to `0.5.0`, repository to the public fork, add bugs/homepage/contributor metadata, update the Pi image URL, and add public official-registry `publishConfig`.

**Step 2: Update lockfile identity**

Change only the root package name/version entries to match `package.json`.

**Step 3: Update installation documentation**

Replace the README title, npm install/invocation commands, and Git clone URL. Add an upstream attribution sentence.

**Step 4: Inspect and commit**

Run `git diff --check`, inspect the metadata diff, and commit as `chore: prepare public npm package`.

### Task 2: Verify the release artifact

**Files:**
- Verify: entire repository

**Step 1: Run code verification**

Run `npm test`, `npm run typecheck`, `npm run lint`, and `git diff --check`.

**Step 2: Inspect package contents**

Run `npm pack --dry-run --json` and confirm the package identity and required extension files.

**Step 3: Exercise npm publication validation**

Run `npm publish --dry-run --access public --registry https://registry.npmjs.org` and require exit code zero.

### Task 3: Publish source and package

**Files:**
- External: `LJC-god/pi-quotas`
- External: npm registry

**Step 1: Verify fast-forward safety**

Fetch fork `main`, prove it is an ancestor of HEAD, and confirm `v0.5.0` is absent on the fork.

**Step 2: Push source**

Push the integration branch and fast-forward fork `main` to the verified release commit.

**Step 3: Publish npm package**

Run `npm publish --access public --registry https://registry.npmjs.org` and verify `npm view @timiliang/pi-quotas@0.5.0` from the official registry.

**Step 4: Tag the successful release**

Create annotated tag `v0.5.0`, push it to the fork, and verify the tag resolves to the release commit.

### Task 4: Adopt the public package locally

**Files:**
- External local config: `~/.pi/agent/settings.json`

**Step 1: Back up settings**

Copy Pi settings to a timestamped backup directory.

**Step 2: Replace the Git install**

Remove the exact Git-source quota package through Pi's package manager, install `npm:@timiliang/pi-quotas@0.5.0`, and avoid duplicate quota extensions.

**Step 3: Verify adoption**

Confirm Pi lists one quota package, settings contain only the npm source, and the installed package contains `/opencode-go:setup` plus both guided steps.
