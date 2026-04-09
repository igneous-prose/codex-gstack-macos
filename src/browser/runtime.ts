import { mkdirSync, writeFileSync } from "node:fs";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import path from "node:path";

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Route
} from "playwright";

import { type SupportedCookieBrowser } from "./config.js";
import { importCookiesForDomains, listCookieDomains } from "./chromium-cookies.js";
import { validateOutputPath } from "./path-policy.js";

function normalizeHostLiteral(host: string): string {
  const normalizedHost = host.trim().toLowerCase();
  const withoutBrackets =
    normalizedHost.startsWith("[") && normalizedHost.endsWith("]")
      ? normalizedHost.slice(1, -1)
      : normalizedHost;
  if (withoutBrackets.endsWith(".")) {
    return withoutBrackets.replace(/\.+$/, "");
  }
  return withoutBrackets;
}

function isIpv4Address(host: string): boolean {
  const octets = host.split(".");
  if (octets.length !== 4) {
    return false;
  }
  return octets.every((octet) => {
    if (!/^\d+$/.test(octet)) {
      return false;
    }
    const value = Number.parseInt(octet, 10);
    return value >= 0 && value <= 255;
  });
}

function isBlockedPrivateIpv4(host: string): boolean {
  if (!isIpv4Address(host)) {
    return false;
  }

  const octets = host.split(".").map((octet) => Number.parseInt(octet, 10));
  const first = octets[0];
  const second = octets[1];
  if (first === undefined || second === undefined) {
    return false;
  }

  if (first === 10) {
    return true;
  }

  if (first === 0) {
    return true;
  }

  if (first === 127) {
    return true;
  }

  if (first === 169 && second === 254) {
    return true;
  }

  if (first === 172 && second >= 16 && second <= 31) {
    return true;
  }

  if (first === 192 && second === 168) {
    return true;
  }

  return false;
}

function isLocalhostHost(host: string): boolean {
  const normalizedHost = normalizeHostLiteral(host);
  return (
    normalizedHost === "localhost" ||
    normalizedHost.endsWith(".localhost") ||
    normalizedHost === "127.0.0.1" ||
    normalizedHost === "::1"
  );
}

function firstIpv6Hextet(host: string): number | null {
  const normalizedHost = normalizeHostLiteral(host);
  if (isIP(normalizedHost) !== 6) {
    return null;
  }

  if (normalizedHost.startsWith("::")) {
    return 0;
  }

  const firstChunk = normalizedHost.split(":")[0];
  if (!firstChunk || !/^[0-9a-f]{1,4}$/i.test(firstChunk)) {
    return null;
  }

  return Number.parseInt(firstChunk, 16);
}

function isBlockedPrivateIpv6(host: string): boolean {
  const normalizedHost = normalizeHostLiteral(host);
  if (isIP(normalizedHost) !== 6) {
    return false;
  }

  if (normalizedHost === "::") {
    return true;
  }

  const firstHextet = firstIpv6Hextet(normalizedHost);
  if (firstHextet === null) {
    return false;
  }

  if ((firstHextet & 0xffc0) === 0xfe80) {
    return true;
  }

  if ((firstHextet & 0xfe00) === 0xfc00) {
    return true;
  }

  if ((firstHextet & 0xffc0) === 0xfec0) {
    return true;
  }

  return false;
}

function parseMappedIpv4FromIpv6(host: string): string | null {
  const normalizedHost = normalizeHostLiteral(host);
  if (!normalizedHost.startsWith("::ffff:")) {
    return null;
  }

  const suffix = normalizedHost.slice("::ffff:".length);
  if (isIpv4Address(suffix)) {
    return suffix;
  }

  const hexParts = suffix.split(":");
  if (hexParts.length !== 2 || !hexParts.every((part) => /^[0-9a-f]{1,4}$/i.test(part))) {
    return null;
  }

  const highPart = hexParts[0];
  const lowPart = hexParts[1];
  if (highPart === undefined || lowPart === undefined) {
    return null;
  }

  const high = Number.parseInt(highPart, 16);
  const low = Number.parseInt(lowPart, 16);
  return [
    (high >> 8) & 0xff,
    high & 0xff,
    (low >> 8) & 0xff,
    low & 0xff
  ].join(".");
}

function classifyResolvedAddress(address: string): "loopback" | "private" | "public" {
  if (isLocalhostHost(address)) {
    return "loopback";
  }

  const mappedIpv4 = parseMappedIpv4FromIpv6(address);
  if (mappedIpv4) {
    if (isLocalhostHost(mappedIpv4)) {
      return "loopback";
    }
    if (isBlockedPrivateIpv4(mappedIpv4)) {
      return "private";
    }
    return "public";
  }

  if (isBlockedPrivateIpv4(address) || isBlockedPrivateIpv6(address)) {
    return "private";
  }

  return "public";
}

type ResolvedHostnameClassification = "loopback" | "private" | "public";

async function classifyResolvedHostname(host: string): Promise<ResolvedHostnameClassification> {
  const normalizedHost = normalizeHostLiteral(host);
  if (isIP(normalizedHost) !== 0) {
    return "public";
  }

  let resolvedAddresses: { address: string; family: number }[];
  try {
    resolvedAddresses = await lookup(normalizedHost, { all: true, verbatim: true });
  } catch {
    throw new Error("Unable to resolve hostname for network policy validation.");
  }

  if (resolvedAddresses.length === 0) {
    throw new Error("Unable to resolve hostname for network policy validation.");
  }

  let sawLoopback = false;
  for (const entry of resolvedAddresses) {
    const classification = classifyResolvedAddress(entry.address);
    if (classification === "private") {
      return "private";
    }
    if (classification === "loopback") {
      sawLoopback = true;
    }
  }

  return sawLoopback ? "loopback" : "public";
}

async function validateResolvedHostname(host: string, allowLocalhost: boolean): Promise<void> {
  const classification = await classifyResolvedHostname(host);
  if (classification === "private") {
    throw new Error("Private and loopback IP targets are blocked.");
  }

  if (classification === "loopback" && !allowLocalhost) {
    throw new Error("Localhost targets require --allow-localhost for local dev verification.");
  }
}

async function validatePageUrl(
  candidateUrl: string,
  allowLocalhost = false
): Promise<string> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(candidateUrl);
  } catch {
    throw new Error(`Invalid URL: ${candidateUrl}`);
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Only http:// and https:// URLs are allowed.");
  }

  const host = parsedUrl.hostname.toLowerCase();

  if (isLocalhostHost(host)) {
    if (!allowLocalhost) {
      throw new Error("Localhost targets require --allow-localhost for local dev verification.");
    }
    return parsedUrl.toString();
  }

  const mappedIpv4 = parseMappedIpv4FromIpv6(host);
  if (mappedIpv4) {
    if (isLocalhostHost(mappedIpv4)) {
      if (!allowLocalhost) {
        throw new Error("Localhost targets require --allow-localhost for local dev verification.");
      }
      return parsedUrl.toString();
    }

    if (isBlockedPrivateIpv4(mappedIpv4)) {
      throw new Error("Private and loopback IP targets are blocked.");
    }
  }

  if (isBlockedPrivateIpv4(host)) {
    throw new Error("Private and loopback IP targets are blocked.");
  }

  if (isBlockedPrivateIpv6(host)) {
    throw new Error("Private and loopback IP targets are blocked.");
  }

  await validateResolvedHostname(host, allowLocalhost);
  return parsedUrl.toString();
}

async function installRequestGuard(
  page: Page,
  allowLocalhost: boolean,
  setBlockedError: (error: Error) => void
): Promise<() => Promise<void>> {
  const handler = async (route: Route): Promise<void> => {
    try {
      await validatePageUrl(route.request().url(), allowLocalhost);
      await route.continue();
    } catch (error) {
      setBlockedError(
        error instanceof Error ? error : new Error("Blocked request by network policy.")
      );
      await route.abort("blockedbyclient");
    }
  };

  await page.route("**/*", handler);
  return async () => {
    await page.unroute("**/*", handler);
  };
}

export class BrowserRuntime {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly repoRoot: string) {}

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.context = null;
    this.browser = null;
  }

  async screenshot(
    url: string,
    outputPath: string,
    allowLocalhost = false
  ): Promise<{ outputPath: string }> {
    return this.capturePage(url, outputPath, allowLocalhost, async (page, validatedOutputPath) => {
      await page.screenshot({ path: validatedOutputPath, fullPage: true });
    });
  }

  async snapshot(
    url: string,
    outputPath: string,
    allowLocalhost = false
  ): Promise<{ outputPath: string }> {
    return this.capturePage(url, outputPath, allowLocalhost, async (page, validatedOutputPath) => {
      writeFileSync(validatedOutputPath, await page.content(), "utf8");
    });
  }

  listCookieDomains(browser: SupportedCookieBrowser): string[] {
    return listCookieDomains(browser);
  }

  async importCookies(
    browser: SupportedCookieBrowser,
    domains: string[]
  ): Promise<{ importedCount: number }> {
    const cookies = importCookiesForDomains(browser, domains);
    if (cookies.length === 0) {
      return { importedCount: 0 };
    }
    return this.runExclusive(async () => {
      await (await this.getContext()).addCookies(cookies);
      return { importedCount: cookies.length };
    });
  }

  private async capturePage(
    url: string,
    outputPath: string,
    allowLocalhost: boolean,
    capture: (page: Awaited<ReturnType<BrowserContext["newPage"]>>, validatedOutputPath: string) => Promise<void>
  ): Promise<{ outputPath: string }> {
    const validatedUrl = await validatePageUrl(url, allowLocalhost);
    const validatedOutputPath = validateOutputPath(this.repoRoot, outputPath);
    mkdirSync(path.dirname(validatedOutputPath), { recursive: true });

    return this.runExclusive(async () => {
      const page = await (await this.getContext()).newPage();
      let blockedError: Error | null = null;
      let removeRequestGuard: (() => Promise<void>) | null = null;
      let primaryError: unknown;
      let cleanupError: unknown;
      let result: { outputPath: string } | undefined;

      try {
        removeRequestGuard = await installRequestGuard(
          page,
          allowLocalhost,
          (error) => {
            blockedError = error;
          }
        );

        try {
          await page.goto(validatedUrl, { waitUntil: "domcontentloaded" });
        } catch (error) {
          if (blockedError) {
            throw blockedError;
          }
          throw error;
        }
        if (blockedError) {
          throw blockedError;
        }
        await capture(page, validatedOutputPath);
        if (blockedError) {
          throw blockedError;
        }
        result = { outputPath: validatedOutputPath };
      } catch (error) {
        primaryError = error;
      }

      try {
        await removeRequestGuard?.();
      } catch (error) {
        cleanupError = error;
      }

      try {
        await page.close();
      } catch (error) {
        if (cleanupError === undefined) {
          cleanupError = error;
        }
      }

      if (primaryError !== undefined) {
        throw primaryError;
      }
      if (cleanupError !== undefined) {
        throw cleanupError;
      }

      return result ?? { outputPath: validatedOutputPath };
    });
  }

  private async getContext(): Promise<BrowserContext> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: true });
    }

    if (!this.context) {
      this.context = await this.browser.newContext();
    }

    return this.context;
  }

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.operationQueue;
    let release: (() => void) | undefined;
    this.operationQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    try {
      return await operation();
    } finally {
      release?.();
    }
  }
}

export { validatePageUrl };
