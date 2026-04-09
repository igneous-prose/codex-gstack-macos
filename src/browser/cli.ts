import { chmodSync, openSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { listCookieDomains } from "./chromium-cookies.js";
import {
  ensureRuntimePaths,
  getDaemonConnection,
  PRIVATE_FILE_MODE,
  resolveTargetRepo,
  type SupportedCookieBrowser
} from "./config.js";
import { getDaemonInfo } from "./daemon.js";
import { clearDaemonState, isProcessAlive, redactDaemonState, type DaemonState } from "./state.js";

function getRepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function readMultiOption(args: string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    const next = args[index + 1];
    if (current === name && next) {
      values.push(next);
    }
  }
  return values;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

export function buildPageCommandRequest(args: string[]): {
  routePath: "/page/screenshot" | "/page/snapshot";
  body: {
    url: string;
    outputPath: string;
    allowLocalhost: boolean;
  };
} {
  const subcommand = args[1];
  const url = readOption(args, "--url");
  const outputPath = readOption(args, "--output");
  const allowLocalhost = hasFlag(args, "--allow-localhost");

  if (!url || !outputPath) {
    throw new Error("--url and --output are required.");
  }

  const routePath = subcommand === "screenshot" ? "/page/screenshot" : "/page/snapshot";
  return {
    routePath,
    body: {
      url,
      outputPath,
      allowLocalhost
    }
  };
}

export function openDaemonLogFile(logFilePath: string): number {
  const logFd = openSync(logFilePath, "a", PRIVATE_FILE_MODE);
  chmodSync(logFilePath, PRIVATE_FILE_MODE);
  return logFd;
}

export function buildDaemonStatusPayload(
  daemonState: DaemonState | null,
  isRunning: boolean
): Record<string, unknown> {
  return {
    status: isRunning ? "running" : "stopped",
    daemonState: daemonState ? redactDaemonState(daemonState) : null,
    ...(daemonState
      ? {
          tokenHint: "Run `npm run browser:token -- --repo <target-repo>` to reveal the bearer token."
        }
      : {})
  };
}

export function buildDaemonTokenPayload(daemonState: DaemonState): Record<string, unknown> {
  return { token: getDaemonConnection(daemonState.targetRepo).token };
}

async function waitForHealth(host: string, port: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://${host}:${port}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the daemon is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Timed out waiting for daemon health check.");
}

async function callDaemon(
  targetRepo: string,
  routePath: string,
  init: RequestInit = {}
): Promise<unknown> {
  const { daemonState } = getDaemonInfo(targetRepo);
  if (!daemonState || !isProcessAlive(daemonState.pid)) {
    throw new Error("Browser daemon is not running. Start it with `npm run browser:start`.");
  }
  const connection = getDaemonConnection(targetRepo);

  const response = await fetch(`http://${connection.host}:${connection.port}${routePath}`, {
    ...init,
    headers: {
      authorization: `Bearer ${connection.token}`,
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const body = (await response.json()) as { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? `Daemon call failed with ${response.status}`);
  }
  return body;
}

async function handleDaemonCommand(args: string[]): Promise<void> {
  const subcommand = args[1];
  const targetRepo = resolveTargetRepo(readOption(args, "--repo"));

  if (subcommand === "start") {
    const { runtimePaths, daemonState } = getDaemonInfo(targetRepo);
    if (daemonState && isProcessAlive(daemonState.pid)) {
      console.log(JSON.stringify(buildDaemonStatusPayload(daemonState, true), null, 2));
      return;
    }

    clearDaemonState(runtimePaths);
    const connection = getDaemonConnection(targetRepo);

    const repoRoot = getRepoRoot();
    const tsxCliPath = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
    const logFd = openDaemonLogFile(runtimePaths.daemonLogFile);
    const child = spawn(
      process.execPath,
      [tsxCliPath, path.join(repoRoot, "src/browser/daemon-entry.ts"), "--repo", targetRepo],
      {
        cwd: repoRoot,
        detached: true,
        stdio: ["ignore", logFd, logFd]
      }
    );
    child.unref();
    await waitForHealth(connection.host, connection.port);
    const currentState = getDaemonInfo(targetRepo).daemonState;
    console.log(JSON.stringify(buildDaemonStatusPayload(currentState, true), null, 2));
    return;
  }

  if (subcommand === "stop") {
    const { runtimePaths, daemonState } = getDaemonInfo(targetRepo);
    if (!daemonState || !isProcessAlive(daemonState.pid)) {
      clearDaemonState(runtimePaths);
      console.log(JSON.stringify({ status: "stopped" }, null, 2));
      return;
    }
    process.kill(daemonState.pid, "SIGTERM");
    clearDaemonState(runtimePaths);
    console.log(JSON.stringify({ status: "stopped" }, null, 2));
    return;
  }

  if (subcommand === "status") {
    const { daemonState } = getDaemonInfo(targetRepo);
    const isRunning = daemonState ? isProcessAlive(daemonState.pid) : false;
    console.log(JSON.stringify(buildDaemonStatusPayload(daemonState, isRunning), null, 2));
    return;
  }

  if (subcommand === "token") {
    const { daemonState } = getDaemonInfo(targetRepo);
    if (!daemonState || !isProcessAlive(daemonState.pid)) {
      throw new Error("Browser daemon is not running. Start it with `npm run browser:start`.");
    }
    console.log(JSON.stringify(buildDaemonTokenPayload(daemonState), null, 2));
    return;
  }

  throw new Error(`Unknown daemon subcommand: ${subcommand}`);
}

async function handlePageCommand(args: string[]): Promise<void> {
  const targetRepo = resolveTargetRepo(readOption(args, "--repo"));
  const { routePath, body } = buildPageCommandRequest(args);
  const result = await callDaemon(targetRepo, routePath, {
    method: "POST",
    body: JSON.stringify(body)
  });
  console.log(JSON.stringify(result, null, 2));
}

async function handleCookieCommand(args: string[]): Promise<void> {
  const subcommand = args[1];
  const browser = readOption(args, "--browser") as SupportedCookieBrowser | undefined;

  if (!browser) {
    throw new Error("--browser is required.");
  }

  if (subcommand === "list-domains") {
    console.log(JSON.stringify({ domains: listCookieDomains(browser) }, null, 2));
    return;
  }

  if (subcommand === "import") {
    const targetRepo = resolveTargetRepo(readOption(args, "--repo"));
    const domains = readMultiOption(args, "--domain");
    if (domains.length === 0) {
      throw new Error("At least one --domain value is required.");
    }
    console.error("Cookie import uses real browser session material.");
    const result = await callDaemon(targetRepo, "/cookies/import", {
      method: "POST",
      body: JSON.stringify({ browser, domains })
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  throw new Error(`Unknown cookie subcommand: ${subcommand}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const topLevelCommand = args[0];

  if (!topLevelCommand) {
    throw new Error("A command is required.");
  }

  ensureRuntimePaths(resolveTargetRepo(readOption(args, "--repo")));

  switch (topLevelCommand) {
    case "daemon":
      await handleDaemonCommand(args);
      break;
    case "page":
      await handlePageCommand(args);
      break;
    case "cookies":
      await handleCookieCommand(args);
      break;
    default:
      throw new Error(`Unknown command: ${topLevelCommand}`);
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const modulePath = fileURLToPath(import.meta.url);

if (entryPath === modulePath) {
  await main();
}
