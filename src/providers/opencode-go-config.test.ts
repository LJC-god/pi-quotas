import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearOpenCodeGoConfig,
  clearOpenCodeGoConfigCache,
  getOpenCodeGoManagedConfigPath,
  normalizeOpenCodeGoAuthCookieInput,
  normalizeOpenCodeGoWorkspaceInput,
  resolveOpenCodeGoConfigCached,
  saveOpenCodeGoConfig,
} from "./opencode-go-config.js";

const tempDirs = new Set<string>();
const originalWorkspaceId = process.env.OPENCODE_GO_WORKSPACE_ID;
const originalAuthCookie = process.env.OPENCODE_GO_AUTH_COOKIE;

afterEach(async () => {
  clearOpenCodeGoConfigCache();
  if (originalWorkspaceId === undefined) {
    delete process.env.OPENCODE_GO_WORKSPACE_ID;
  } else {
    process.env.OPENCODE_GO_WORKSPACE_ID = originalWorkspaceId;
  }
  if (originalAuthCookie === undefined) {
    delete process.env.OPENCODE_GO_AUTH_COOKIE;
  } else {
    process.env.OPENCODE_GO_AUTH_COOKIE = originalAuthCookie;
  }
  await Promise.all(
    [...tempDirs].map((path) => rm(path, { recursive: true, force: true })),
  );
  tempDirs.clear();
});

async function createTempHome(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "pi-quotas-opencode-go-"));
  tempDirs.add(path);
  return path;
}

describe("OpenCode Go setup input normalization", () => {
  it("accepts a raw workspace ID", () => {
    expect(normalizeOpenCodeGoWorkspaceInput("ws_123-abc")).toBe(
      "ws_123-abc",
    );
  });

  it("extracts a workspace ID from the canonical dashboard URL", () => {
    expect(
      normalizeOpenCodeGoWorkspaceInput(
        "https://opencode.ai/workspace/ws_123-abc/go",
      ),
    ).toBe("ws_123-abc");
  });

  it.each([
    "http://opencode.ai/workspace/ws_123/go",
    "https://evil.example/workspace/ws_123/go",
    "https://opencode.ai/workspace/ws_123/go?next=evil",
    "https://opencode.ai/workspace/ws_123/go#fragment",
    "ws_123/other",
    "ws 123",
    "ws_123\nsecond",
  ])("rejects an unsafe workspace input: %s", (input) => {
    expect(() => normalizeOpenCodeGoWorkspaceInput(input)).toThrow();
  });

  it("accepts a raw auth cookie value", () => {
    expect(normalizeOpenCodeGoAuthCookieInput("cookie.secret-value_123")).toBe(
      "cookie.secret-value_123",
    );
  });

  it("extracts auth from a copied cookie header", () => {
    expect(
      normalizeOpenCodeGoAuthCookieInput(
        "theme=dark; auth=secret-value; locale=en",
      ),
    ).toBe("secret-value");
  });

  it.each(["", "   ", "theme=dark; locale=en", "auth=", "value\nnext"])(
    "rejects an unsafe auth cookie input",
    (input) => {
      expect(() => normalizeOpenCodeGoAuthCookieInput(input)).toThrow();
    },
  );
});

describe("OpenCode Go managed configuration", () => {
  it("atomically creates the managed JSON file", async () => {
    const homeDir = await createTempHome();
    const managedPath = getOpenCodeGoManagedConfigPath(homeDir);

    const savedPath = await saveOpenCodeGoConfig(
      { workspaceId: "ws_first", authCookie: "secret-first" },
      { homeDir },
    );

    expect(savedPath).toBe(managedPath);
    expect(JSON.parse(await readFile(managedPath, "utf8"))).toEqual({
      workspaceId: "ws_first",
      authCookie: "secret-first",
    });
    if (process.platform !== "win32") {
      expect((await stat(managedPath)).mode & 0o777).toBe(0o600);
    }
  });

  it("replaces an existing managed configuration", async () => {
    const homeDir = await createTempHome();
    const managedPath = getOpenCodeGoManagedConfigPath(homeDir);

    await saveOpenCodeGoConfig(
      { workspaceId: "ws_first", authCookie: "secret-first" },
      { homeDir },
    );
    await saveOpenCodeGoConfig(
      { workspaceId: "ws_second", authCookie: "secret-second" },
      { homeDir },
    );

    expect(JSON.parse(await readFile(managedPath, "utf8"))).toEqual({
      workspaceId: "ws_second",
      authCookie: "secret-second",
    });
  });

  it("clears only the managed configuration", async () => {
    const homeDir = await createTempHome();
    const managedPath = getOpenCodeGoManagedConfigPath(homeDir);
    const unrelatedPath = join(homeDir, "keep.txt");
    await writeFile(unrelatedPath, "keep", "utf8");
    await saveOpenCodeGoConfig(
      { workspaceId: "ws_first", authCookie: "secret-first" },
      { homeDir },
    );

    expect(await clearOpenCodeGoConfig({ homeDir })).toBe(true);
    await expect(readFile(managedPath, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await readFile(unrelatedPath, "utf8")).toBe("keep");
    expect(await clearOpenCodeGoConfig({ homeDir })).toBe(false);
  });

  it("clears the in-memory resolver cache", async () => {
    process.env.OPENCODE_GO_WORKSPACE_ID = "ws_first";
    process.env.OPENCODE_GO_AUTH_COOKIE = "secret-first";
    const first = await resolveOpenCodeGoConfigCached();

    process.env.OPENCODE_GO_WORKSPACE_ID = "ws_second";
    process.env.OPENCODE_GO_AUTH_COOKIE = "secret-second";
    const cached = await resolveOpenCodeGoConfigCached();
    clearOpenCodeGoConfigCache();
    const refreshed = await resolveOpenCodeGoConfigCached();

    expect(first).toMatchObject({
      state: "configured",
      config: { workspaceId: "ws_first" },
    });
    expect(cached).toEqual(first);
    expect(refreshed).toMatchObject({
      state: "configured",
      config: { workspaceId: "ws_second" },
    });
  });
});
