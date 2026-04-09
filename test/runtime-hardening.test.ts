import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const playwrightMocks = vi.hoisted(() => ({
  launch: vi.fn(),
  newContext: vi.fn(),
  newPage: vi.fn(),
  goto: vi.fn(),
  screenshot: vi.fn(),
  content: vi.fn(),
  addCookies: vi.fn(),
  closePage: vi.fn(),
  closeContext: vi.fn(),
  closeBrowser: vi.fn()
}));

vi.mock("playwright", () => ({
  chromium: {
    launch: playwrightMocks.launch
  }
}));

import {
  PRIVATE_DIRECTORY_MODE,
  PRIVATE_FILE_MODE,
  ensureRuntimePaths
} from "../src/browser/config.js";
import {
  buildPageCommandRequest,
  buildDaemonStatusPayload,
  buildDaemonTokenPayload,
  openDaemonLogFile
} from "../src/browser/cli.js";
import {
  SECURITY_BINARY,
  SQLITE3_BINARY
} from "../src/browser/chromium-cookies.js";
import { redactDaemonState, writeDaemonState } from "../src/browser/state.js";
import { BrowserRuntime, validatePageUrl } from "../src/browser/runtime.js";

describe("runtime hardening", () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();

    const page = {
      goto: playwrightMocks.goto,
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
    playwrightMocks.screenshot.mockResolvedValue(undefined);
    playwrightMocks.content.mockResolvedValue("<html></html>");
    playwrightMocks.addCookies.mockResolvedValue(undefined);
    playwrightMocks.closePage.mockResolvedValue(undefined);
    playwrightMocks.closeContext.mockResolvedValue(undefined);
    playwrightMocks.closeBrowser.mockResolvedValue(undefined);
    playwrightMocks.newPage.mockResolvedValue(page);
    playwrightMocks.newContext.mockResolvedValue(context);
    playwrightMocks.launch.mockResolvedValue(browser);
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
      host: "127.0.0.1",
      port: 47770,
      token: "secret-token",
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

  it("redacts daemon state for normal output", () => {
    expect(
      redactDaemonState({
        pid: 123,
        host: "127.0.0.1",
        port: 47770,
        token: "secret-token",
        targetRepo: "/tmp/repo",
        startedAt: "2026-04-09T10:00:00.000Z"
      })
    ).toEqual({
      pid: 123,
      host: "127.0.0.1",
      port: 47770,
      targetRepo: "/tmp/repo",
      startedAt: "2026-04-09T10:00:00.000Z",
      token: "[redacted]",
      tokenRedacted: true
    });
  });

  it("requires the explicit daemon token command to reveal the token", () => {
    const daemonState = {
      pid: process.pid,
      host: "127.0.0.1",
      port: 47770,
      token: "secret-token",
      targetRepo: "/tmp/repo",
      startedAt: "2026-04-09T10:00:00.000Z"
    };

    const statusPayload = buildDaemonStatusPayload(daemonState, true);
    const tokenPayload = buildDaemonTokenPayload(daemonState);

    expect(JSON.stringify(statusPayload)).toContain('"token":"[redacted]"');
    expect(JSON.stringify(statusPayload)).not.toContain("secret-token");
    expect(statusPayload).toHaveProperty("tokenHint");
    expect(tokenPayload).toEqual({ token: "secret-token" });
  });

  it("allows only http and https page URLs", () => {
    expect(validatePageUrl("https://example.com/path", false)).toBe("https://example.com/path");
    expect(validatePageUrl("http://example.com/path", false)).toBe("http://example.com/path");
    expect(() => validatePageUrl("file:///etc/passwd")).toThrow(/Only http:\/\/ and https:\/\//);
    expect(() => validatePageUrl("data:text/plain,hello")).toThrow(/Only http:\/\/ and https:\/\//);
    expect(() => validatePageUrl("javascript:alert(1)")).toThrow(/Only http:\/\/ and https:\/\//);
  });

  it("rejects localhost and loopback by default but allows them with opt-in", () => {
    expect(() => validatePageUrl("http://localhost:3000", false)).toThrow(/--allow-localhost/);
    expect(() => validatePageUrl("http://localhost.:3000", false)).toThrow(/--allow-localhost/);
    expect(() => validatePageUrl("http://foo.localhost:3000", false)).toThrow(/--allow-localhost/);
    expect(() => validatePageUrl("http://foo.localhost.:3000", false)).toThrow(/--allow-localhost/);
    expect(() => validatePageUrl("http://127.0.0.1:3000", false)).toThrow(/--allow-localhost/);
    expect(() => validatePageUrl("http://[::1]:3000", false)).toThrow(/--allow-localhost/);
    expect(() => validatePageUrl("http://[::ffff:127.0.0.1]:3000", false)).toThrow(/--allow-localhost/);

    expect(validatePageUrl("http://localhost:3000", true)).toBe("http://localhost:3000/");
    expect(validatePageUrl("http://localhost.:3000", true)).toBe("http://localhost.:3000/");
    expect(validatePageUrl("http://foo.localhost:3000", true)).toBe("http://foo.localhost:3000/");
    expect(validatePageUrl("http://foo.localhost.:3000", true)).toBe("http://foo.localhost.:3000/");
    expect(validatePageUrl("http://127.0.0.1:3000", true)).toBe("http://127.0.0.1:3000/");
    expect(validatePageUrl("http://[::1]:3000", true)).toBe("http://[::1]:3000/");
    expect(validatePageUrl("http://[::ffff:127.0.0.1]:3000", true)).toBe("http://[::ffff:7f00:1]:3000/");
  });

  it("rejects literal private, wildcard, and link-local IPv4 targets", () => {
    expect(() => validatePageUrl("http://0.0.0.0:3000", false)).toThrow(/Private and loopback IP/);
    expect(() => validatePageUrl("http://0:3000", false)).toThrow(/Private and loopback IP/);
    expect(() => validatePageUrl("http://10.0.0.1:3000", false)).toThrow(/Private and loopback IP/);
    expect(() => validatePageUrl("http://172.16.5.4:3000", false)).toThrow(/Private and loopback IP/);
    expect(() => validatePageUrl("http://192.168.1.20:3000", false)).toThrow(/Private and loopback IP/);
    expect(() => validatePageUrl("http://169.254.10.20:3000", false)).toThrow(/Private and loopback IP/);
    expect(() => validatePageUrl("http://[::ffff:0:0]:3000", false)).toThrow(/Private and loopback IP/);
    expect(() => validatePageUrl("http://[::ffff:10.0.0.5]:3000", false)).toThrow(/Private and loopback IP/);
    expect(() => validatePageUrl("http://[::ffff:172.16.5.4]:3000", false)).toThrow(/Private and loopback IP/);
    expect(() => validatePageUrl("http://[::ffff:192.168.1.20]:3000", false)).toThrow(/Private and loopback IP/);
    expect(() => validatePageUrl("http://[::ffff:169.254.10.20]:3000", false)).toThrow(/Private and loopback IP/);
  });

  it("rejects native IPv6 local and private ranges while allowing public IPv6", () => {
    expect(() => validatePageUrl("http://[::]:3000", false)).toThrow(/Private and loopback IP/);
    expect(() => validatePageUrl("http://[fe80::1]:3000", false)).toThrow(/Private and loopback IP/);
    expect(() => validatePageUrl("http://[fc00::1]:3000", false)).toThrow(/Private and loopback IP/);
    expect(() => validatePageUrl("http://[fd00::1]:3000", false)).toThrow(/Private and loopback IP/);
    expect(() => validatePageUrl("http://[fec0::1]:3000", false)).toThrow(/Private and loopback IP/);

    expect(validatePageUrl("http://[2001:4860:4860::8888]/", false)).toBe("http://[2001:4860:4860::8888]/");
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
});
