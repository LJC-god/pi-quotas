import { randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export interface OpenCodeGoConfig {
  workspaceId: string;
  authCookie: string;
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;
const SAFE_WORKSPACE_ID = /^[A-Za-z0-9_-]+$/u;

function requireSafeWorkspaceId(value: string): string {
  if (!SAFE_WORKSPACE_ID.test(value)) {
    throw new Error("Enter a valid OpenCode Go workspace ID or dashboard URL");
  }
  return value;
}

export function normalizeOpenCodeGoWorkspaceInput(input: string): string {
  const value = input.trim();
  if (!value || CONTROL_CHARACTERS.test(value)) {
    throw new Error("OpenCode Go workspace is required");
  }

  if (!value.includes("://")) return requireSafeWorkspaceId(value);

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid OpenCode Go dashboard URL");
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== "opencode.ai" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("Enter an https://opencode.ai workspace URL");
  }

  const match = /^\/workspace\/([^/]+)\/go\/?$/u.exec(url.pathname);
  if (!match?.[1]) {
    throw new Error("Enter an OpenCode Go workspace dashboard URL");
  }
  return requireSafeWorkspaceId(match[1]);
}

export function normalizeOpenCodeGoAuthCookieInput(input: string): string {
  const value = input.trim();
  if (!value || CONTROL_CHARACTERS.test(value)) {
    throw new Error("OpenCode Go auth cookie is required");
  }

  const cookieParts = value.split(";").map((part) => part.trim());
  const authPart = cookieParts.find((part) => {
    const separator = part.indexOf("=");
    return separator >= 0 && part.slice(0, separator).trim() === "auth";
  });

  let authCookie = value;
  if (authPart) {
    authCookie = authPart.slice(authPart.indexOf("=") + 1).trim();
  } else if (value.includes(";") || /^[^=]+=/.test(value)) {
    throw new Error("Copied cookies do not contain an auth value");
  }

  if (
    !authCookie ||
    CONTROL_CHARACTERS.test(authCookie) ||
    /[\s;]/u.test(authCookie)
  ) {
    throw new Error("OpenCode Go auth cookie is invalid");
  }
  return authCookie;
}

export type ResolvedOpenCodeGoConfig =
  | { state: "none" }
  | { state: "configured"; config: OpenCodeGoConfig; source: string }
  | { state: "incomplete"; source: string; missing: string }
  | { state: "invalid"; source: string; error: string };

export function getOpenCodeGoManagedConfigPath(
  homeDir = homedir(),
): string {
  return join(
    homeDir,
    ".config",
    "opencode",
    "opencode-quota",
    "opencode-go.json",
  );
}

function getConfigCandidatePaths(homeDir = homedir()): string[] {
  return [
    getOpenCodeGoManagedConfigPath(homeDir),
    join(homeDir, ".config", "opencode-go", "config.json"),
  ];
}

export async function saveOpenCodeGoConfig(
  config: OpenCodeGoConfig,
  options?: { homeDir?: string },
): Promise<string> {
  const normalized: OpenCodeGoConfig = {
    workspaceId: normalizeOpenCodeGoWorkspaceInput(config.workspaceId),
    authCookie: normalizeOpenCodeGoAuthCookieInput(config.authCookie),
  };
  const path = getOpenCodeGoManagedConfigPath(options?.homeDir);
  const directory = dirname(path);
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(directory, { recursive: true });

  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(normalized, null, 2)}\n`,
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
    await rename(temporaryPath, path);
    await chmod(path, 0o600).catch(() => undefined);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }

  clearOpenCodeGoConfigCache();
  return path;
}

export async function clearOpenCodeGoConfig(options?: {
  homeDir?: string;
}): Promise<boolean> {
  const path = getOpenCodeGoManagedConfigPath(options?.homeDir);
  try {
    await unlink(path);
    clearOpenCodeGoConfigCache();
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      clearOpenCodeGoConfigCache();
      return false;
    }
    throw error;
  }
}

async function readConfigFile(
  path: string,
): Promise<
  | { state: "missing" }
  | { state: "loaded"; config: Partial<OpenCodeGoConfig> }
  | { state: "invalid"; error: string }
> {
  try {
    const data = await readFile(path, "utf-8");
    const parsed = JSON.parse(data) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        state: "invalid",
        error: "Config file must contain a JSON object",
      };
    }
    return { state: "loaded", config: parsed as Partial<OpenCodeGoConfig> };
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return { state: "missing" };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      state: "invalid",
      error: `Failed to read config file: ${message}`,
    };
  }
}

export function resolveOpenCodeGoConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedOpenCodeGoConfig | null {
  const workspaceId = env.OPENCODE_GO_WORKSPACE_ID?.trim();
  const authCookie = env.OPENCODE_GO_AUTH_COOKIE?.trim();

  if (!workspaceId && !authCookie) return null;

  if (workspaceId && authCookie) {
    return {
      state: "configured",
      config: { workspaceId, authCookie },
      source: "env",
    };
  }

  return {
    state: "incomplete",
    source: "env",
    missing: workspaceId
      ? "OPENCODE_GO_AUTH_COOKIE"
      : "OPENCODE_GO_WORKSPACE_ID",
  };
}

export async function resolveOpenCodeGoConfig(): Promise<ResolvedOpenCodeGoConfig> {
  const envResult = resolveOpenCodeGoConfigFromEnv();
  if (envResult) return envResult;

  const candidates = getConfigCandidatePaths();
  for (const path of candidates) {
    const fileResult = await readConfigFile(path);
    if (fileResult.state === "missing") continue;
    if (fileResult.state === "invalid") {
      return { state: "invalid", source: path, error: fileResult.error };
    }

    const config = fileResult.config;
    const workspaceId =
      typeof config.workspaceId === "string" ? config.workspaceId.trim() : "";
    const authCookie =
      typeof config.authCookie === "string" ? config.authCookie.trim() : "";

    if (workspaceId && authCookie) {
      return {
        state: "configured",
        config: { workspaceId, authCookie },
        source: path,
      };
    }

    const missing = !workspaceId ? "workspaceId" : "authCookie";
    return { state: "incomplete", source: path, missing };
  }

  return { state: "none" };
}

let cachedConfig: ResolvedOpenCodeGoConfig | null = null;
let cachedAt = 0;

const CACHE_MAX_AGE_MS = 30_000;

export function clearOpenCodeGoConfigCache(): void {
  cachedConfig = null;
  cachedAt = 0;
}

export async function resolveOpenCodeGoConfigCached(params?: {
  maxAgeMs?: number;
}): Promise<ResolvedOpenCodeGoConfig> {
  const maxAgeMs = Math.max(0, params?.maxAgeMs ?? CACHE_MAX_AGE_MS);
  const now = Date.now();
  if (cachedConfig && now - cachedAt < maxAgeMs) {
    return cachedConfig;
  }
  cachedConfig = await resolveOpenCodeGoConfig();
  cachedAt = now;
  return cachedConfig;
}
