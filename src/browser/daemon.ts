import { BrowserRuntime } from "./runtime.js";
import {
  DEFAULT_HOST,
  ensureRuntimePaths,
  getDaemonConnection,
  type RuntimePaths,
  resolveTargetRepo
} from "./config.js";
import {
  clearDaemonState,
  readDaemonState,
  type DaemonState,
  type PersistedDaemonState,
  writeDaemonState
} from "./state.js";
import { startBrowserServer } from "./server.js";

export interface StartDaemonOptions {
  readonly targetRepo: string;
}

export function coerceAllowLocalhost(value: unknown): boolean {
  return value === true;
}

export async function runDaemon(options: StartDaemonOptions): Promise<void> {
  const targetRepo = resolveTargetRepo(options.targetRepo);
  const runtimePaths = ensureRuntimePaths(targetRepo);
  const connection = getDaemonConnection(targetRepo);

  const runtime = new BrowserRuntime(targetRepo);
  const serverInfo = await startBrowserServer({
    host: DEFAULT_HOST,
    port: connection.port,
    token: connection.token,
    handlers: {
      screenshot: async (payload) =>
        runtime.screenshot(payload.url, payload.outputPath, coerceAllowLocalhost(payload.allowLocalhost)),
      snapshot: async (payload) =>
        runtime.snapshot(payload.url, payload.outputPath, coerceAllowLocalhost(payload.allowLocalhost)),
      listCookieDomains: (browser) => runtime.listCookieDomains(browser),
      importCookies: async ({ browser, domains }) => runtime.importCookies(browser, domains)
    }
  });

  const daemonState: DaemonState = {
    pid: process.pid,
    targetRepo,
    startedAt: new Date().toISOString()
  };

  writeDaemonState(runtimePaths, daemonState);

  const shutdown = async (): Promise<void> => {
    clearDaemonState(runtimePaths);
    await runtime.close();
    await serverInfo.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

export function getDaemonInfo(targetRepo: string): {
  readonly runtimePaths: RuntimePaths;
  readonly daemonState: PersistedDaemonState | null;
} {
  const resolvedRepo = resolveTargetRepo(targetRepo);
  const runtimePaths = ensureRuntimePaths(resolvedRepo);
  return {
    runtimePaths,
    daemonState: readDaemonState(runtimePaths)
  };
}
