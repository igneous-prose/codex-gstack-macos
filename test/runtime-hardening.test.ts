import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dnsMocks = vi.hoisted(() => ({
  lookup: vi.fn()
}));

const routeState = vi.hoisted(() => ({
  handler: undefined as
    | ((route: {
        request: () => { url: () => string };
        continue: () => Promise<void>;
        abort: (errorCode?: string) => Promise<void>;
      }) => Promise<void>)
    | undefined
}));

const playwrightMocks = vi.hoisted(() => ({
  launch: vi.fn(),
  newContext: vi.fn(),
  newPage: vi.fn(),
  goto: vi.fn(),
  routePage: vi.fn(),
  unroutePage: vi.fn(),
  continueRoute: vi.fn(),
  abortRoute: vi.fn(),
  screenshot: vi.fn(),
  content: vi.fn(),
  addCookies: vi.fn(),
  closePage: vi.fn(),
  closeContext: vi.fn(),
  closeBrowser: vi.fn()
}));

vi.mock("node:dns/promises", () => ({
  lookup: dnsMocks.lookup
}));

vi.mock("playwright", () => ({
  chromium: {
    launch: playwrightMocks.launch
  }
}));

import {
  DAEMON_PORT_RANGE,
  DEFAULT_PORT,
  PRIVATE_DIRECTORY_MODE,
  PRIVATE_FILE_MODE,
  ensureRuntimePaths,
  getDaemonConnection
} from "../src/browser/config.js";
import {
  assertNoDeprecatedDaemonStartFlags,
  buildLegacyDaemonUpgradeMessage,
  buildPageCommandRequest,
  buildDaemonStatusPayload,
  buildDaemonTokenPayload,
  openDaemonLogFile,
  shouldRestartRunningDaemon
} from "../src/browser/cli.js";
import {
  SECURITY_BINARY,
  SQLITE3_BINARY
} from "../src/browser/chromium-cookies.js";
import {
  isLegacyDaemonState,
  readDaemonState,
  redactDaemonState,
  writeDaemonState
} from "../src/browser/state.js";
import { BrowserRuntime, validatePageUrl } from "../src/browser/runtime.js";

describe("runtime hardening", () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    routeState.handler = undefined;

    const page = {
      goto: playwrightMocks.goto,
      route: playwrightMocks.routePage,
      unroute: playwrightMocks.unroutePage,
      screenshot: playwrightMocks.screenshot,
      content: playwrightMocks.content,
      close: playwrightMocks.closePage
    };
    const context = {
      newPage: playwrightMocks.newPage,
      addCookies: playwrightMocks.addCookies,
      close: playwrightMocks.closeContext
    };
    const browser = {
      newContext: playwrightMocks.newContext,
      close: playwrightMocks.closeBrowser
    };

    playwrightMocks.goto.mockResolvedValue(undefined);
    playwrightMocks.routePage.mockImplementation(async (_pattern: string, handler: typeof routeState.handler) => {
      routeState.handler = handler ?? undefined;
    });
    playwrightMocks.unroutePage.mockResolvedValue(undefined);
    playwrightMocks.continueRoute.mockResolvedValue(undefined);
    playwrightMocks.abortRoute.mockResolvedValue(undefined);
    playwrightMocks.screenshot.mockResolvedValue(undefined);
    playwrightMocks.content.mockResolvedValue("<html></html>");
    playwrightMocks.addCookies.mockResolvedValue(undefined);
    playwrightMocks.closePage.mockResolvedValue(undefined);
    playwrightMocks.closeContext.mockResolvedValue(undefined);
    playwrightMocks.closeBrowser.mockResolvedValue(undefined);
    playwrightMocks.newPage.mockResolvedValue(page);
    playwrightMocks.newContext.mockResolvedValue(context);
    playwrightMocks.launch.mockResolvedValue(browser);
    dnsMocks.lookup.mockImplementation(async (hostname: string) => {
      if (hostname === "example.com") {
        return [{ address: "93.184.216.34", family: 4 }];
      }
      if (hostname === "public.example") {
        return [{ address: "93.184.216.35", family: 4 }];
      }
      if (hostname === "loopback.example") {
        return [{ address: "127.0.0.1", family: 4 }];
      }
      if (hostname === "private.example") {
        return [{ address: "192.168.1.20", family: 4 }];
      }
      if (hostname === "mixed.example") {
        return [
          { address: "93.184.216.34", family: 4 },
          { address: "10.0.0.5", family: 4 }
        ];
      }
      return [{ address: "93.184.216.34", family: 4 }];
    });
  });

  afterEach(() => {
    for (const tempDir of tempDirs) {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("creates runtime directories and files with owner-only permissions", () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-sec-"));
    tempDirs.push(targetRepo);

    const runtimePaths = ensureRuntimePaths(targetRepo);
    writeDaemonState(runtimePaths, {
      pid: process.pid,
      targetRepo,
      startedAt: "2026-04-09T10:00:00.000Z"
    });
    const logFd = openDaemonLogFile(runtimePaths.daemonLogFile);
    writeFileSync(logFd, "", "utf8");

    expect(statSync(runtimePaths.runtimeRoot).mode & 0o777).toBe(PRIVATE_DIRECTORY_MODE);
    expect(statSync(runtimePaths.browserDir).mode & 0o777).toBe(PRIVATE_DIRECTORY_MODE);
    expect(statSync(runtimePaths.logsDir).mode & 0o777).toBe(PRIVATE_DIRECTORY_MODE);
    expect(statSync(runtimePaths.daemonStateFile).mode & 0o777).toBe(PRIVATE_FILE_MODE);
    expect(statSync(runtimePaths.daemonLogFile).mode & 0o777).toBe(PRIVATE_FILE_MODE);
  });

  it("persists only minimal daemon state to disk", () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-state-"));
    tempDirs.push(targetRepo);

    const runtimePaths = ensureRuntimePaths(targetRepo);
    writeDaemonState(runtimePaths, {
      pid: 123,
      targetRepo,
      startedAt: "2026-04-09T10:00:00.000Z"
    });

    const persistedState = JSON.parse(readFileSync(runtimePaths.daemonStateFile, "utf8")) as
      Record<string, unknown>;

    expect(persistedState).toEqual({
      pid: 123,
      targetRepo,
      startedAt: "2026-04-09T10:00:00.000Z"
    });
    expect(persistedState).not.toHaveProperty("host");
    expect(persistedState).not.toHaveProperty("port");
    expect(persistedState).not.toHaveProperty("token");
  });

  it("detects legacy daemon state written by older versions", () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-legacy-state-"));
    tempDirs.push(targetRepo);

    const runtimePaths = ensureRuntimePaths(targetRepo);
    writeFileSync(
      runtimePaths.daemonStateFile,
      `${JSON.stringify({
        pid: 123,
        host: "127.0.0.1",
        port: 47770,
        token: "legacy-token",
        targetRepo,
        startedAt: "2026-04-09T10:00:00.000Z"
      })}\n`,
      {
        encoding: "utf8",
        mode: PRIVATE_FILE_MODE
      }
    );

    const daemonState = readDaemonState(runtimePaths);

    expect(daemonState).not.toBeNull();
    expect(isLegacyDaemonState(daemonState!)).toBe(true);
    expect(daemonState).toMatchObject({
      pid: 123,
      targetRepo,
      startedAt: "2026-04-09T10:00:00.000Z"
    });
  });

  it("redacts daemon state for normal output", () => {
    const connection = getDaemonConnection("/tmp/repo");

    expect(
      redactDaemonState({
        pid: 123,
        targetRepo: "/tmp/repo",
        startedAt: "2026-04-09T10:00:00.000Z"
      })
    ).toEqual({
      pid: 123,
      host: connection.host,
      port: connection.port,
      targetRepo: "/tmp/repo",
      startedAt: "2026-04-09T10:00:00.000Z",
      token: "[redacted]",
      tokenRedacted: true
    });
  });

  it("requires the explicit daemon token command to reveal the token", () => {
    const daemonState = {
      pid: process.pid,
      targetRepo: "/tmp/repo",
      startedAt: "2026-04-09T10:00:00.000Z"
    };
    const connection = getDaemonConnection(daemonState.targetRepo);

    const statusPayload = buildDaemonStatusPayload(daemonState, true);
    const tokenPayload = buildDaemonTokenPayload(daemonState);

    expect(JSON.stringify(statusPayload)).toContain('"token":"[redacted]"');
    expect(JSON.stringify(statusPayload)).not.toContain(connection.token);
    expect(statusPayload).toHaveProperty("tokenHint");
    expect(tokenPayload).toEqual({ token: connection.token });
  });

  it("requires a restart before revealing a legacy daemon token", () => {
    const legacyState = {
      pid: 123,
      host: "127.0.0.1",
      port: 47770,
      token: "legacy-token",
      targetRepo: "/tmp/repo",
      startedAt: "2026-04-09T10:00:00.000Z"
    };

    expect(() => buildDaemonTokenPayload(legacyState)).toThrow(
      buildLegacyDaemonUpgradeMessage("/tmp/repo")
    );
  });

  it("marks running legacy daemons as restart-required", () => {
    const legacyState = {
      pid: 123,
      host: "127.0.0.1",
      port: 47770,
      token: "legacy-token",
      targetRepo: "/tmp/repo",
      startedAt: "2026-04-09T10:00:00.000Z"
    };

    expect(buildDaemonStatusPayload(legacyState, true)).toMatchObject({
      status: "restart-required",
      restartRequired: true,
      message: buildLegacyDaemonUpgradeMessage("/tmp/repo")
    });
    expect(shouldRestartRunningDaemon(legacyState, true)).toBe(true);
    expect(shouldRestartRunningDaemon(legacyState, false)).toBe(false);
  });

  it("derives a stable per-repo daemon connection without persisting it", () => {
    const first = getDaemonConnection("/tmp/repo");
    const second = getDaemonConnection("/tmp/repo");
    const different = getDaemonConnection("/tmp/other-repo");

    expect(first).toEqual(second);
    expect(first.host).toBe("127.0.0.1");
    expect(first.port).toBeGreaterThanOrEqual(DEFAULT_PORT);
    expect(first.port).toBeLessThan(DEFAULT_PORT + DAEMON_PORT_RANGE);
    expect(first.token).toMatch(/^[a-f0-9]{64}$/);
    expect(different.port).not.toBe(first.port);
    expect(different.token).not.toBe(first.token);
  });

  it("rejects deprecated daemon start flags", () => {
    expect(() => assertNoDeprecatedDaemonStartFlags(["daemon", "start"])).not.toThrow();
    expect(() => assertNoDeprecatedDaemonStartFlags(["daemon", "start", "--port", "47770"])).toThrow(
      /no longer supported/
    );
    expect(() => assertNoDeprecatedDaemonStartFlags(["daemon", "start", "--token", "secret"])).toThrow(
      /no longer supported/
    );
  });

  it("allows only http and https page URLs", async () => {
    await expect(validatePageUrl("https://example.com/path", false)).resolves.toBe(
      "https://example.com/path"
    );
    await expect(validatePageUrl("http://example.com/path", false)).resolves.toBe(
      "http://example.com/path"
    );
    await expect(validatePageUrl("file:///etc/passwd")).rejects.toThrow(/Only http:\/\/ and https:\/\//);
    await expect(validatePageUrl("data:text/plain,hello")).rejects.toThrow(/Only http:\/\/ and https:\/\//);
    await expect(validatePageUrl("javascript:alert(1)")).rejects.toThrow(/Only http:\/\/ and https:\/\//);
  });

  it("rejects localhost and loopback by default but allows them with opt-in", async () => {
    await expect(validatePageUrl("http://localhost:3000", false)).rejects.toThrow(/--allow-localhost/);
    await expect(validatePageUrl("http://localhost.:3000", false)).rejects.toThrow(/--allow-localhost/);
    await expect(validatePageUrl("http://foo.localhost:3000", false)).rejects.toThrow(/--allow-localhost/);
    await expect(validatePageUrl("http://foo.localhost.:3000", false)).rejects.toThrow(/--allow-localhost/);
    await expect(validatePageUrl("http://127.0.0.1:3000", false)).rejects.toThrow(/--allow-localhost/);
    await expect(validatePageUrl("http://[::1]:3000", false)).rejects.toThrow(/--allow-localhost/);
    await expect(validatePageUrl("http://[::ffff:127.0.0.1]:3000", false)).rejects.toThrow(/--allow-localhost/);

    await expect(validatePageUrl("http://localhost:3000", true)).resolves.toBe("http://localhost:3000/");
    await expect(validatePageUrl("http://localhost.:3000", true)).resolves.toBe("http://localhost.:3000/");
    await expect(validatePageUrl("http://foo.localhost:3000", true)).resolves.toBe("http://foo.localhost:3000/");
    await expect(validatePageUrl("http://foo.localhost.:3000", true)).resolves.toBe("http://foo.localhost.:3000/");
    await expect(validatePageUrl("http://127.0.0.1:3000", true)).resolves.toBe("http://127.0.0.1:3000/");
    await expect(validatePageUrl("http://[::1]:3000", true)).resolves.toBe("http://[::1]:3000/");
    await expect(validatePageUrl("http://[::ffff:127.0.0.1]:3000", true)).resolves.toBe(
      "http://[::ffff:7f00:1]:3000/"
    );
  });

  it("rejects literal private, wildcard, and link-local IPv4 targets", async () => {
    await expect(validatePageUrl("http://0.0.0.0:3000", false)).rejects.toThrow(/Private and loopback IP/);
    await expect(validatePageUrl("http://0:3000", false)).rejects.toThrow(/Private and loopback IP/);
    await expect(validatePageUrl("http://10.0.0.1:3000", false)).rejects.toThrow(/Private and loopback IP/);
    await expect(validatePageUrl("http://172.16.5.4:3000", false)).rejects.toThrow(/Private and loopback IP/);
    await expect(validatePageUrl("http://192.168.1.20:3000", false)).rejects.toThrow(/Private and loopback IP/);
    await expect(validatePageUrl("http://169.254.10.20:3000", false)).rejects.toThrow(/Private and loopback IP/);
    await expect(validatePageUrl("http://[::ffff:0:0]:3000", false)).rejects.toThrow(/Private and loopback IP/);
    await expect(validatePageUrl("http://[::ffff:10.0.0.5]:3000", false)).rejects.toThrow(/Private and loopback IP/);
    await expect(validatePageUrl("http://[::ffff:172.16.5.4]:3000", false)).rejects.toThrow(/Private and loopback IP/);
    await expect(validatePageUrl("http://[::ffff:192.168.1.20]:3000", false)).rejects.toThrow(/Private and loopback IP/);
    await expect(validatePageUrl("http://[::ffff:169.254.10.20]:3000", false)).rejects.toThrow(/Private and loopback IP/);
  });

  it("rejects native IPv6 local and private ranges while allowing public IPv6", async () => {
    await expect(validatePageUrl("http://[::]:3000", false)).rejects.toThrow(/Private and loopback IP/);
    await expect(validatePageUrl("http://[fe80::1]:3000", false)).rejects.toThrow(/Private and loopback IP/);
    await expect(validatePageUrl("http://[fc00::1]:3000", false)).rejects.toThrow(/Private and loopback IP/);
    await expect(validatePageUrl("http://[fd00::1]:3000", false)).rejects.toThrow(/Private and loopback IP/);
    await expect(validatePageUrl("http://[fec0::1]:3000", false)).rejects.toThrow(/Private and loopback IP/);

    await expect(validatePageUrl("http://[2001:4860:4860::8888]/", false)).resolves.toBe(
      "http://[2001:4860:4860::8888]/"
    );
  });

  it("rejects hostnames that resolve to loopback or private addresses", async () => {
    await expect(validatePageUrl("http://loopback.example:3000", false)).rejects.toThrow(/--allow-localhost/);
    await expect(validatePageUrl("http://loopback.example:3000", true)).resolves.toBe(
      "http://loopback.example:3000/"
    );
    await expect(validatePageUrl("http://private.example:3000", false)).rejects.toThrow(
      /Private and loopback IP/
    );
    await expect(validatePageUrl("http://mixed.example:3000", false)).rejects.toThrow(
      /Private and loopback IP/
    );
  });

  it("allows hostnames that resolve only to public addresses", async () => {
    await expect(validatePageUrl("http://public.example:3000", false)).resolves.toBe(
      "http://public.example:3000/"
    );
  });

  it("fails closed when hostname resolution cannot be completed", async () => {
    dnsMocks.lookup.mockRejectedValueOnce(Object.assign(new Error("lookup failed"), { code: "ENOTFOUND" }));

    await expect(validatePageUrl("http://missing.example:3000", false)).rejects.toThrow(
      /Unable to resolve hostname/
    );
  });

  it("fails closed on transient DNS resolution errors", async () => {
    dnsMocks.lookup.mockRejectedValueOnce(Object.assign(new Error("temporary failure"), { code: "EAI_AGAIN" }));

    await expect(validatePageUrl("http://transient.example:3000", false)).rejects.toThrow(
      /Unable to resolve hostname/
    );
  });

  it("parses --allow-localhost only on page commands", () => {
    expect(
      buildPageCommandRequest([
        "page",
        "snapshot",
        "--url",
        "http://localhost:3000",
        "--output",
        "/tmp/out.html"
      ])
    ).toEqual({
      routePath: "/page/snapshot",
      body: {
        url: "http://localhost:3000",
        outputPath: "/tmp/out.html",
        allowLocalhost: false
      }
    });

    expect(
      buildPageCommandRequest([
        "page",
        "screenshot",
        "--url",
        "http://localhost:3000",
        "--allow-localhost",
        "--output",
        "/tmp/out.png"
      ])
    ).toEqual({
      routePath: "/page/screenshot",
      body: {
        url: "http://localhost:3000",
        outputPath: "/tmp/out.png",
        allowLocalhost: true
      }
    });
  });

  it("pins cookie helper binaries to absolute macOS system paths", () => {
    expect(SQLITE3_BINARY).toBe("/usr/bin/sqlite3");
    expect(SECURITY_BINARY).toBe("/usr/bin/security");
  });

  it("does not allocate browser state for rejected localhost captures", async () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-runtime-"));
    tempDirs.push(targetRepo);
    const runtime = new BrowserRuntime(targetRepo);

    await expect(runtime.screenshot("http://localhost:3000", "/tmp/out.png", false)).rejects.toThrow(
      /--allow-localhost/
    );

    expect(playwrightMocks.launch).not.toHaveBeenCalled();
    expect(playwrightMocks.newContext).not.toHaveBeenCalled();
    expect(playwrightMocks.newPage).not.toHaveBeenCalled();
  });

  it("does not allocate browser state for rejected output paths", async () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-runtime-"));
    tempDirs.push(targetRepo);
    const runtime = new BrowserRuntime(targetRepo);

    await expect(
      runtime.screenshot("https://example.com", path.join(os.homedir(), "Desktop", "shot.png"), false)
    ).rejects.toThrow(/Refusing to write outside approved paths/);

    expect(playwrightMocks.launch).not.toHaveBeenCalled();
    expect(playwrightMocks.newContext).not.toHaveBeenCalled();
    expect(playwrightMocks.newPage).not.toHaveBeenCalled();
  });

  it("allocates and closes one page for successful screenshots", async () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-runtime-"));
    tempDirs.push(targetRepo);
    const runtime = new BrowserRuntime(targetRepo);

    await expect(runtime.screenshot("https://example.com", "/tmp/out.png", false)).resolves.toEqual({
      outputPath: "/private/tmp/out.png"
    });

    expect(playwrightMocks.launch).toHaveBeenCalledOnce();
    expect(playwrightMocks.newContext).toHaveBeenCalledOnce();
    expect(playwrightMocks.newPage).toHaveBeenCalledOnce();
    expect(playwrightMocks.goto).toHaveBeenCalledOnce();
    expect(playwrightMocks.screenshot).toHaveBeenCalledOnce();
    expect(playwrightMocks.closePage).toHaveBeenCalledOnce();
  });

  it("allocates and closes one page for successful snapshots", async () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-runtime-"));
    tempDirs.push(targetRepo);
    const runtime = new BrowserRuntime(targetRepo);

    await expect(runtime.snapshot("https://example.com", "/tmp/out.html", false)).resolves.toEqual({
      outputPath: "/private/tmp/out.html"
    });

    expect(playwrightMocks.launch).toHaveBeenCalledOnce();
    expect(playwrightMocks.newContext).toHaveBeenCalledOnce();
    expect(playwrightMocks.newPage).toHaveBeenCalledOnce();
    expect(playwrightMocks.goto).toHaveBeenCalledOnce();
    expect(playwrightMocks.content).toHaveBeenCalledOnce();
    expect(playwrightMocks.closePage).toHaveBeenCalledOnce();
  });

  it("closes the page when navigation fails after allocation", async () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-runtime-"));
    tempDirs.push(targetRepo);
    const runtime = new BrowserRuntime(targetRepo);
    playwrightMocks.goto.mockRejectedValueOnce(new Error("navigation failed"));

    await expect(runtime.screenshot("https://example.com", "/tmp/out.png", false)).rejects.toThrow(
      "navigation failed"
    );

    expect(playwrightMocks.newPage).toHaveBeenCalledOnce();
    expect(playwrightMocks.closePage).toHaveBeenCalledOnce();
  });

  it("closes the page if request guard installation fails", async () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-runtime-"));
    tempDirs.push(targetRepo);
    const runtime = new BrowserRuntime(targetRepo);
    playwrightMocks.routePage.mockRejectedValueOnce(new Error("route setup failed"));

    await expect(runtime.screenshot("https://example.com", "/tmp/out.png", false)).rejects.toThrow(
      "route setup failed"
    );

    expect(playwrightMocks.newPage).toHaveBeenCalledOnce();
    expect(playwrightMocks.closePage).toHaveBeenCalledOnce();
  });

  it("closes the page if request guard teardown fails", async () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-runtime-"));
    tempDirs.push(targetRepo);
    const runtime = new BrowserRuntime(targetRepo);
    playwrightMocks.unroutePage.mockRejectedValueOnce(new Error("route teardown failed"));

    await expect(runtime.screenshot("https://example.com", "/tmp/out.png", false)).rejects.toThrow(
      "route teardown failed"
    );

    expect(playwrightMocks.newPage).toHaveBeenCalledOnce();
    expect(playwrightMocks.closePage).toHaveBeenCalledOnce();
  });

  it("preserves the primary capture error if teardown also fails", async () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-runtime-"));
    tempDirs.push(targetRepo);
    const runtime = new BrowserRuntime(targetRepo);
    playwrightMocks.goto.mockRejectedValueOnce(new Error("navigation failed"));
    playwrightMocks.unroutePage.mockRejectedValueOnce(new Error("route teardown failed"));

    await expect(runtime.screenshot("https://example.com", "/tmp/out.png", false)).rejects.toThrow(
      "navigation failed"
    );

    expect(playwrightMocks.closePage).toHaveBeenCalledOnce();
  });

  it("blocks redirected requests to private targets during capture", async () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-runtime-"));
    tempDirs.push(targetRepo);
    const runtime = new BrowserRuntime(targetRepo);

    playwrightMocks.goto.mockImplementationOnce(async () => {
      await routeState.handler?.({
        request: () => ({ url: () => "http://private.example:3000/redirected" }),
        continue: playwrightMocks.continueRoute,
        abort: playwrightMocks.abortRoute
      });
    });

    await expect(runtime.screenshot("https://example.com", "/tmp/out.png", false)).rejects.toThrow(
      /Private and loopback IP/
    );

    expect(playwrightMocks.abortRoute).toHaveBeenCalledWith("blockedbyclient");
    expect(playwrightMocks.closePage).toHaveBeenCalledOnce();
  });

  it("revalidates hostnames during capture to block DNS rebinding", async () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-runtime-"));
    tempDirs.push(targetRepo);
    const runtime = new BrowserRuntime(targetRepo);
    let rebindLookupCount = 0;

    dnsMocks.lookup.mockImplementation(async (hostname: string) => {
      if (hostname === "rebind.example") {
        rebindLookupCount += 1;
        if (rebindLookupCount === 1) {
          return [{ address: "93.184.216.34", family: 4 }];
        }
        return [{ address: "127.0.0.1", family: 4 }];
      }

      if (hostname === "example.com") {
        return [{ address: "93.184.216.34", family: 4 }];
      }

      return [{ address: "93.184.216.35", family: 4 }];
    });

    playwrightMocks.goto.mockImplementationOnce(async () => {
      await routeState.handler?.({
        request: () => ({ url: () => "http://rebind.example:3000/" }),
        continue: playwrightMocks.continueRoute,
        abort: playwrightMocks.abortRoute
      });
    });

    await expect(runtime.screenshot("http://rebind.example:3000", "/tmp/out.png", false)).rejects.toThrow(
      /--allow-localhost/
    );

    expect(rebindLookupCount).toBe(2);
    expect(playwrightMocks.abortRoute).toHaveBeenCalledWith("blockedbyclient");
  });

  it("serializes browser page operations through a single runtime slot", async () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-runtime-"));
    tempDirs.push(targetRepo);
    const runtime = new BrowserRuntime(targetRepo);

    let releaseFirstGoto: (() => void) | undefined;
    const firstGoto = new Promise<void>((resolve) => {
      releaseFirstGoto = resolve;
    });

    playwrightMocks.goto
      .mockImplementationOnce(() => firstGoto)
      .mockResolvedValueOnce(undefined);

    const firstCapture = runtime.screenshot("https://example.com", "/tmp/first.png", false);
    const secondCapture = runtime.snapshot("https://example.com", "/tmp/second.html", false);

    await vi.waitFor(() => {
      expect(playwrightMocks.newPage).toHaveBeenCalledTimes(1);
    });

    releaseFirstGoto?.();
    await firstCapture;
    await secondCapture;

    expect(playwrightMocks.newPage).toHaveBeenCalledTimes(2);
    expect(playwrightMocks.closePage).toHaveBeenCalledTimes(2);
  });
});
