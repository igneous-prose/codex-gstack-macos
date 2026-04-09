import { chmodSync, existsSync, mkdirSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 47770;
export const PRIVATE_DIRECTORY_MODE = 0o700;
export const PRIVATE_FILE_MODE = 0o600;

export type SupportedCookieBrowser = "brave" | "chrome" | "chromium" | "edge";

export const SUPPORTED_COOKIE_BROWSERS: SupportedCookieBrowser[] = [
  "brave",
  "chrome",
  "chromium",
  "edge"
];

export interface RuntimePaths {
  readonly repoRoot: string;
  readonly runtimeRoot: string;
  readonly browserDir: string;
  readonly logsDir: string;
  readonly daemonStateFile: string;
  readonly daemonLogFile: string;
}

export function resolveTargetRepo(inputPath?: string): string {
  const candidate = inputPath ? path.resolve(inputPath) : process.cwd();
  if (!existsSync(candidate)) {
    throw new Error(`Target repo does not exist: ${candidate}`);
  }
  return realpathSync(candidate);
}

export function getRuntimePaths(repoRoot: string): RuntimePaths {
  const runtimeRoot = path.join(repoRoot, ".codex-gstack");
  const browserDir = path.join(runtimeRoot, "browser");
  const logsDir = path.join(runtimeRoot, "logs");
  return {
    repoRoot,
    runtimeRoot,
    browserDir,
    logsDir,
    daemonStateFile: path.join(browserDir, "daemon.json"),
    daemonLogFile: path.join(logsDir, "browser-daemon.log")
  };
}

export function ensureRuntimePaths(repoRoot: string): RuntimePaths {
  const runtimePaths = getRuntimePaths(repoRoot);
  mkdirSync(runtimePaths.runtimeRoot, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  mkdirSync(runtimePaths.browserDir, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  mkdirSync(runtimePaths.logsDir, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  chmodSync(runtimePaths.runtimeRoot, PRIVATE_DIRECTORY_MODE);
  chmodSync(runtimePaths.browserDir, PRIVATE_DIRECTORY_MODE);
  chmodSync(runtimePaths.logsDir, PRIVATE_DIRECTORY_MODE);
  return runtimePaths;
}

export function assertMacosArm64(): void {
  if (process.platform !== "darwin") {
    throw new Error("This tool supports only macOS.");
  }
  if (os.arch() !== "arm64") {
    throw new Error("This tool supports only Apple Silicon (arm64).");
  }
}
