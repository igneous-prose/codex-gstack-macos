import { chmodSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";

import { PRIVATE_FILE_MODE } from "./config.js";
import { type RuntimePaths } from "./config.js";

export interface DaemonState {
  readonly pid: number;
  readonly host: string;
  readonly port: number;
  readonly token: string;
  readonly targetRepo: string;
  readonly startedAt: string;
}

export interface PublicDaemonState extends Omit<DaemonState, "token"> {
  readonly token: string;
  readonly tokenRedacted: boolean;
}

export function redactDaemonState(state: DaemonState): PublicDaemonState {
  return {
    pid: state.pid,
    host: state.host,
    port: state.port,
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

export function readDaemonState(runtimePaths: RuntimePaths): DaemonState | null {
  try {
    return JSON.parse(readFileSync(runtimePaths.daemonStateFile, "utf8")) as DaemonState;
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
