import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { chromium, type Browser, type BrowserContext } from "playwright";

import { type SupportedCookieBrowser } from "./config.js";
import { importCookiesForDomains, listCookieDomains } from "./chromium-cookies.js";
import { validateOutputPath } from "./path-policy.js";

function validatePageUrl(candidateUrl: string): string {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(candidateUrl);
  } catch {
    throw new Error(`Invalid URL: ${candidateUrl}`);
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Only http:// and https:// URLs are allowed.");
  }

  return parsedUrl.toString();
}

export class BrowserRuntime {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor(private readonly repoRoot: string) {}

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.context = null;
    this.browser = null;
  }

  async screenshot(url: string, outputPath: string): Promise<{ outputPath: string }> {
    const page = await (await this.getContext()).newPage();
    const validatedUrl = validatePageUrl(url);
    const validatedOutputPath = validateOutputPath(this.repoRoot, outputPath);
    mkdirSync(path.dirname(validatedOutputPath), { recursive: true });

    try {
      await page.goto(validatedUrl, { waitUntil: "domcontentloaded" });
      await page.screenshot({ path: validatedOutputPath, fullPage: true });
      return { outputPath: validatedOutputPath };
    } finally {
      await page.close();
    }
  }

  async snapshot(url: string, outputPath: string): Promise<{ outputPath: string }> {
    const page = await (await this.getContext()).newPage();
    const validatedUrl = validatePageUrl(url);
    const validatedOutputPath = validateOutputPath(this.repoRoot, outputPath);
    mkdirSync(path.dirname(validatedOutputPath), { recursive: true });

    try {
      await page.goto(validatedUrl, { waitUntil: "domcontentloaded" });
      writeFileSync(validatedOutputPath, await page.content(), "utf8");
      return { outputPath: validatedOutputPath };
    } finally {
      await page.close();
    }
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
    await (await this.getContext()).addCookies(cookies);
    return { importedCount: cookies.length };
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
}

export { validatePageUrl };
