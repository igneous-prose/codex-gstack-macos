import { chmodSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";

import { DEFAULT_HOST, PRIVATE_FILE_MODE } from "./config.js";
import { type RuntimePaths } from "./config.js";

export interface DaemonState {
  readonly pid: number;
  readonly targetRepo: string;
  readonly startedAt: string;
}

export interface LegacyDaemonState extends DaemonState {
  readonly host: string;
  readonly port: number;
  readonly token: string;
}

export type PersistedDaemonState = DaemonState | LegacyDaemonState;

export interface PublicDaemonState extends DaemonState {
  readonly host: string;
  readonly port: number | null;
  readonly token: string;
  readonly tokenRedacted: boolean;
  readonly connectionVerified: boolean;
}

export function isLegacyDaemonState(state: PersistedDaemonState): state is LegacyDaemonState {
  return (
    "host" in state &&
    typeof state.host === "string" &&
    "port" in state &&
    typeof state.port === "number" &&
    "token" in state &&
    typeof state.token === "string"
  );
}

export function redactDaemonState(
  state: PersistedDaemonState,
  connectionOverride?: {
    readonly host: string;
    readonly port: number;
  }
): PublicDaemonState {
  const connection = connectionOverride
    ? connectionOverride
    : isLegacyDaemonState(state)
      ? {
          host: state.host,
          port: state.port
        }
      : {
          host: DEFAULT_HOST,
          port: null
        };
  const connectionVerified = Boolean(connectionOverride) || isLegacyDaemonState(state);
  return {
    pid: state.pid,
    connectionVerified,
    host: connection.host,
    port: connection.port,
    targetRepo: state.targetRepo,
    startedAt: state.startedAt,
    token: "[redacted]",
    tokenRedacted: true
  };
}

export function writeDaemonState(runtimePaths: RuntimePaths, state: DaemonState): void {
  writeFileSync(runtimePaths.daemonStateFile, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: PRIVATE_FILE_MODE
  });
  chmodSync(runtimePaths.daemonStateFile, PRIVATE_FILE_MODE);
}

export function readDaemonState(runtimePaths: RuntimePaths): PersistedDaemonState | null {
  try {
    return JSON.parse(readFileSync(runtimePaths.daemonStateFile, "utf8")) as PersistedDaemonState;
  } catch {
    return null;
  }
}

export function clearDaemonState(runtimePaths: RuntimePaths): void {
  try {
    unlinkSync(runtimePaths.daemonStateFile);
  } catch {
    // Ignore missing state.
  }
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function removeRuntimeRoot(runtimePaths: RuntimePaths): void {
  rmSync(runtimePaths.runtimeRoot, { force: true, recursive: true });
}
