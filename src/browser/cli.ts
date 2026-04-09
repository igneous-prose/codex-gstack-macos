import { chmodSync, openSync } from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { listCookieDomains } from "./chromium-cookies.js";
import {
  ensureRuntimePaths,
  getDefaultDaemonPort,
  getDaemonConnection,
  hashTargetRepo,
  makeDaemonNonce,
  PRIVATE_FILE_MODE,
  resolveTargetRepo,
  type DaemonConnection,
  type DaemonProcessMetadata,
  type SupportedCookieBrowser
} from "./config.js";
import { getDaemonInfo } from "./daemon.js";
import {
  clearDaemonState,
  isLegacyDaemonState,
  isProcessAlive,
  redactDaemonState,
  type PersistedDaemonState
} from "./state.js";

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

export function readDaemonPortOption(args: string[]): number | undefined {
  const portOption = readOption(args, "--port");
  if (portOption === undefined) {
    return undefined;
  }

  const parsedPort = Number.parseInt(portOption, 10);
  if (!Number.isInteger(parsedPort) || `${parsedPort}` !== portOption || parsedPort < 1 || parsedPort > 65_535) {
    throw new Error("--port must be an integer between 1 and 65535.");
  }

  return parsedPort;
}

export function parseDaemonProcessMetadata(commandLine: string): DaemonProcessMetadata | null {
  const repoHashMatch = commandLine.match(/(?:^|\s)--repo-hash\s+([a-f0-9]{64})(?=\s|$)/);
  const portMatch = commandLine.match(/(?:^|\s)--port\s+([0-9]{1,5})(?=\s|$)/);
  const nonceMatch = commandLine.match(/(?:^|\s)--nonce\s+([a-f0-9]{48})(?=\s|$)/);

  if (!repoHashMatch || !portMatch || !nonceMatch) {
    return null;
  }

  const repoHash = repoHashMatch[1];
  const portText = portMatch[1];
  const nonce = nonceMatch[1];
  if (!repoHash || !portText || !nonce) {
    return null;
  }

  const port = Number.parseInt(portText, 10);
  if (port < 1 || port > 65_535) {
    return null;
  }

  return {
    repoHash,
    port,
    nonce
  };
}

function readProcessCommandLine(pid: number): string | null {
  try {
    return execFileSync("/bin/ps", ["-ww", "-p", `${pid}`, "-o", "command="], {
      encoding: "utf8"
    }).trim();
  } catch {
    return null;
  }
}

export function resolveRunningDaemonConnection(
  targetRepo: string,
  pid: number
): DaemonConnection | null {
  const commandLine = readProcessCommandLine(pid);
  if (!commandLine) {
    return null;
  }

  const metadata = parseDaemonProcessMetadata(commandLine);
  if (!metadata || metadata.repoHash !== hashTargetRepo(targetRepo)) {
    return null;
  }

  return getDaemonConnection(targetRepo, metadata.port, metadata.nonce);
}

export function quoteShellArgument(value: string): string {
  return `'${value.split("'").join(`'"'"'`)}'`;
}

export function buildDaemonCommand(
  subcommand: "start" | "stop" | "token",
  targetRepo: string
): string {
  return `npm run browser:${subcommand} -- --repo ${quoteShellArgument(targetRepo)}`;
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
  daemonState: PersistedDaemonState | null,
  isRunning: boolean,
  connectionOverride?: DaemonConnection | null
): Record<string, unknown> {
  const legacyRunningDaemon =
    daemonState && isRunning && isLegacyDaemonState(daemonState) ? daemonState : null;
  const unverifiedRunningDaemon =
    daemonState && isRunning && !legacyRunningDaemon && !connectionOverride ? daemonState : null;
  return {
    status:
      legacyRunningDaemon || unverifiedRunningDaemon
        ? "restart-required"
        : isRunning
          ? "running"
          : "stopped",
    daemonState: daemonState
      ? redactDaemonState(
          daemonState,
          connectionOverride
            ? {
                host: connectionOverride.host,
                port: connectionOverride.port
              }
            : undefined
        )
      : null,
    ...(daemonState && isRunning && connectionOverride && !legacyRunningDaemon
      ? {
          tokenHint: "Run `npm run browser:token -- --repo <target-repo>` to reveal the bearer token."
        }
      : {}),
    ...(legacyRunningDaemon
      ? {
          restartRequired: true,
          message: buildLegacyDaemonUpgradeMessage(legacyRunningDaemon.targetRepo)
        }
      : unverifiedRunningDaemon
        ? {
            restartRequired: true,
            message: buildDaemonVerificationMessage(unverifiedRunningDaemon.targetRepo)
          }
      : {})
  };
}

export function buildLegacyDaemonUpgradeMessage(targetRepo: string): string {
  return `Browser daemon was started by an older version. Run \`${buildDaemonCommand("stop", targetRepo)}\` and then \`${buildDaemonCommand("start", targetRepo)}\`.`;
}

export function buildDaemonVerificationMessage(targetRepo: string): string {
  return `Unable to verify the running browser daemon process. Run \`${buildDaemonCommand("stop", targetRepo)}\` and then \`${buildDaemonCommand("start", targetRepo)}\`.`;
}

export function buildDaemonNotRunningMessage(targetRepo: string): string {
  return `Browser daemon is not running. Start it with \`${buildDaemonCommand("start", targetRepo)}\`.`;
}

export function assertStatusPortOption(
  targetRepo: string,
  connection: DaemonConnection | null,
  portOverride?: number
): void {
  if (portOverride === undefined) {
    return;
  }
  if (!connection) {
    throw new Error(buildDaemonVerificationMessage(targetRepo));
  }
  if (portOverride !== connection.port) {
    throw new Error(
      `Browser daemon is running on port ${connection.port}. Re-run the command with --port ${connection.port} or restart the daemon on port ${portOverride}.`
    );
  }
}

export function assertNoUnsupportedDaemonFlags(args: string[]): void {
  if (args.includes("--token")) {
    throw new Error(
      "Custom daemon tokens are no longer supported. Stop the daemon and restart without --token."
    );
  }
}

export function shouldRestartRunningDaemon(
  daemonState: PersistedDaemonState | null,
  isRunning: boolean
): boolean {
  return Boolean(daemonState && isRunning && isLegacyDaemonState(daemonState));
}

export function buildDaemonTokenPayload(
  daemonState: PersistedDaemonState,
  connection: DaemonConnection
): Record<string, unknown> {
  if (isLegacyDaemonState(daemonState)) {
    throw new Error(buildLegacyDaemonUpgradeMessage(daemonState.targetRepo));
  }
  return { token: connection.token };
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
  init: RequestInit = {},
  portOverride?: number
): Promise<unknown> {
  const { daemonState } = getDaemonInfo(targetRepo);
  if (!daemonState || !isProcessAlive(daemonState.pid)) {
    throw new Error(buildDaemonNotRunningMessage(targetRepo));
  }
  if (isLegacyDaemonState(daemonState)) {
    throw new Error(buildLegacyDaemonUpgradeMessage(targetRepo));
  }
  const connection = resolveRunningDaemonConnection(targetRepo, daemonState.pid);
  if (!connection) {
    throw new Error(buildDaemonVerificationMessage(targetRepo));
  }
  if (portOverride !== undefined && portOverride !== connection.port) {
    throw new Error(
      `Browser daemon is running on port ${connection.port}. Re-run the command with --port ${connection.port} or restart the daemon on port ${portOverride}.`
    );
  }

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
    assertNoUnsupportedDaemonFlags(args);
    const requestedPort = readDaemonPortOption(args) ?? getDefaultDaemonPort(targetRepo);
    const { runtimePaths, daemonState } = getDaemonInfo(targetRepo);
    const isRunning = daemonState ? isProcessAlive(daemonState.pid) : false;
    if (daemonState && isRunning && isLegacyDaemonState(daemonState)) {
      throw new Error(buildLegacyDaemonUpgradeMessage(targetRepo));
    }
    if (daemonState && isRunning) {
      const runningConnection = resolveRunningDaemonConnection(targetRepo, daemonState.pid);
      if (!runningConnection) {
        throw new Error(buildDaemonVerificationMessage(targetRepo));
      }
      if (runningConnection.port !== requestedPort) {
        throw new Error(
          `Browser daemon is already running on port ${runningConnection.port}. Stop it first before starting a daemon on port ${requestedPort}.`
        );
      }
      console.log(JSON.stringify(buildDaemonStatusPayload(daemonState, true, runningConnection), null, 2));
      return;
    }

    clearDaemonState(runtimePaths);
    const metadata: DaemonProcessMetadata = {
      repoHash: hashTargetRepo(targetRepo),
      port: requestedPort,
      nonce: makeDaemonNonce()
    };
    const connection = getDaemonConnection(targetRepo, metadata.port, metadata.nonce);

    const repoRoot = getRepoRoot();
    const tsxCliPath = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
    const logFd = openDaemonLogFile(runtimePaths.daemonLogFile);
    const child = spawn(
      process.execPath,
      [
        tsxCliPath,
        path.join(repoRoot, "src/browser/daemon-entry.ts"),
        "--repo",
        targetRepo,
        "--repo-hash",
        metadata.repoHash,
        "--port",
        `${metadata.port}`,
        "--nonce",
        metadata.nonce
      ],
      {
        cwd: repoRoot,
        detached: true,
        stdio: ["ignore", logFd, logFd]
      }
    );
    child.unref();
    await waitForHealth(connection.host, connection.port);
    const currentState = getDaemonInfo(targetRepo).daemonState;
    console.log(JSON.stringify(buildDaemonStatusPayload(currentState, true, connection), null, 2));
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
    const portOverride = readDaemonPortOption(args);
    const { daemonState } = getDaemonInfo(targetRepo);
    const isRunning = daemonState ? isProcessAlive(daemonState.pid) : false;
    const connection =
      daemonState && isRunning && !isLegacyDaemonState(daemonState)
        ? resolveRunningDaemonConnection(targetRepo, daemonState.pid)
        : null;
    if (daemonState && isRunning && !isLegacyDaemonState(daemonState)) {
      assertStatusPortOption(targetRepo, connection, portOverride);
    }
    console.log(JSON.stringify(buildDaemonStatusPayload(daemonState, isRunning, connection), null, 2));
    return;
  }

  if (subcommand === "token") {
    const { daemonState } = getDaemonInfo(targetRepo);
    if (!daemonState || !isProcessAlive(daemonState.pid)) {
      throw new Error(buildDaemonNotRunningMessage(targetRepo));
    }
    if (isLegacyDaemonState(daemonState)) {
      throw new Error(buildLegacyDaemonUpgradeMessage(targetRepo));
    }
    const connection = resolveRunningDaemonConnection(targetRepo, daemonState.pid);
    if (!connection) {
      throw new Error(buildDaemonVerificationMessage(targetRepo));
    }
    const portOverride = readDaemonPortOption(args);
    if (portOverride !== undefined && portOverride !== connection.port) {
      throw new Error(
        `Browser daemon is running on port ${connection.port}. Re-run the command with --port ${connection.port} or restart the daemon on port ${portOverride}.`
      );
    }
    console.log(JSON.stringify(buildDaemonTokenPayload(daemonState, connection), null, 2));
    return;
  }

  throw new Error(`Unknown daemon subcommand: ${subcommand}`);
}

async function handlePageCommand(args: string[]): Promise<void> {
  const targetRepo = resolveTargetRepo(readOption(args, "--repo"));
  const portOverride = readDaemonPortOption(args);
  const { routePath, body } = buildPageCommandRequest(args);
  const result = await callDaemon(targetRepo, routePath, {
    method: "POST",
    body: JSON.stringify(body)
  }, portOverride);
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
    const portOverride = readDaemonPortOption(args);
    const domains = readMultiOption(args, "--domain");
    if (domains.length === 0) {
      throw new Error("At least one --domain value is required.");
    }
    console.error("Cookie import uses real browser session material.");
    const result = await callDaemon(targetRepo, "/cookies/import", {
      method: "POST",
      body: JSON.stringify({ browser, domains })
    }, portOverride);
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
