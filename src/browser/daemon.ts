import { createHash, randomBytes } from "node:crypto";

import { BrowserRuntime } from "./runtime.js";
import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  ensureRuntimePaths,
  type RuntimePaths,
  resolveTargetRepo
} from "./config.js";
import { clearDaemonState, readDaemonState, type DaemonState, writeDaemonState } from "./state.js";
import { startBrowserServer } from "./server.js";

export interface StartDaemonOptions {
  readonly targetRepo: string;
  readonly port: number;
  readonly token: string;
}

export function makeToken(): string {
  return randomBytes(24).toString("hex");
}

export function makeDeterministicToken(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

export async function runDaemon(options: StartDaemonOptions): Promise<void> {
  const targetRepo = resolveTargetRepo(options.targetRepo);
  const runtimePaths = ensureRuntimePaths(targetRepo);

  const runtime = new BrowserRuntime(targetRepo);
  const serverInfo = await startBrowserServer({
    host: DEFAULT_HOST,
    port: options.port,
    token: options.token,
    handlers: {
      screenshot: async (payload) => runtime.screenshot(payload.url, payload.outputPath),
      snapshot: async (payload) => runtime.snapshot(payload.url, payload.outputPath),
      listCookieDomains: (browser) => runtime.listCookieDomains(browser),
      importCookies: async ({ browser, domains }) => runtime.importCookies(browser, domains)
    }
  });

  const daemonState: DaemonState = {
    pid: process.pid,
    host: serverInfo.host,
    port: serverInfo.port,
    token: options.token,
    targetRepo,
    startedAt: new Date().toISOString()
  };

  writeDaemonState(runtimePaths, daemonState);

  const shutdown = async (): Promise<void> => {
    clearDaemonState(runtimePaths);
    await runtime.close();
    await new Promise<void>((resolve, reject) => {
      serverInfo.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

export function getDaemonInfo(targetRepo: string): {
  readonly runtimePaths: RuntimePaths;
  readonly daemonState: DaemonState | null;
} {
  const resolvedRepo = resolveTargetRepo(targetRepo);
  const runtimePaths = ensureRuntimePaths(resolvedRepo);
  return {
    runtimePaths,
    daemonState: readDaemonState(runtimePaths)
  };
}

export const DEFAULT_DAEMON_PORT = DEFAULT_PORT;

