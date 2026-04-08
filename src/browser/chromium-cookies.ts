import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pbkdf2Sync, createDecipheriv } from "node:crypto";
import { execFileSync } from "node:child_process";

import type { BrowserContext } from "playwright";

import { type SupportedCookieBrowser } from "./config.js";

interface BrowserProfile {
  readonly browser: SupportedCookieBrowser;
  readonly appSupportPath: string;
  readonly safeStorageService: string;
}

const browserProfiles: BrowserProfile[] = [
  {
    browser: "brave",
    appSupportPath: "BraveSoftware/Brave-Browser/Default/Cookies",
    safeStorageService: "Brave Safe Storage"
  },
  {
    browser: "chrome",
    appSupportPath: "Google/Chrome/Default/Cookies",
    safeStorageService: "Chrome Safe Storage"
  },
  {
    browser: "chromium",
    appSupportPath: "Chromium/Default/Cookies",
    safeStorageService: "Chromium Safe Storage"
  },
  {
    browser: "edge",
    appSupportPath: "Microsoft Edge/Default/Cookies",
    safeStorageService: "Microsoft Edge Safe Storage"
  }
];

function sqlQuote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function getProfile(browser: SupportedCookieBrowser): BrowserProfile {
  const profile = browserProfiles.find((entry) => entry.browser === browser);
  if (!profile) {
    throw new Error(`Unsupported browser: ${browser}`);
  }
  return profile;
}

function getCookiesDbPath(profile: BrowserProfile): string {
  return path.join(os.homedir(), "Library", "Application Support", profile.appSupportPath);
}

function withCopiedDb<T>(dbPath: string, callback: (tempDbPath: string) => T): T {
  if (!existsSync(dbPath)) {
    throw new Error(`Cookie database not found: ${dbPath}`);
  }

  const tempDir = mkdtempSync(path.join("/tmp", "codex-gstack-cookies-"));
  const tempDbPath = path.join(tempDir, "Cookies.sqlite");
  copyFileSync(dbPath, tempDbPath);

  try {
    return callback(tempDbPath);
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}

function querySqlite(dbPath: string, sql: string): string {
  return execFileSync("sqlite3", ["-separator", "\t", dbPath, sql], {
    encoding: "utf8"
  }).trim();
}

function getSafeStoragePassword(service: string): string {
  return execFileSync("security", ["find-generic-password", "-w", "-s", service], {
    encoding: "utf8"
  }).trim();
}

function decryptChromiumValue(encryptedHex: string, service: string): string {
  if (encryptedHex.length === 0) {
    return "";
  }

  const encryptedBuffer = Buffer.from(encryptedHex, "hex");
  if (encryptedBuffer.length === 0) {
    return "";
  }

  const versionTag = encryptedBuffer.subarray(0, 3).toString("utf8");
  if (versionTag !== "v10" && versionTag !== "v11") {
    return encryptedBuffer.toString("utf8");
  }

  const password = getSafeStoragePassword(service);
  const key = pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1");
  const iv = Buffer.alloc(16, 0x20);
  const decipher = createDecipheriv("aes-128-cbc", key, iv);
  const decrypted = Buffer.concat([
    decipher.update(encryptedBuffer.subarray(3)),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}

function chromeTimestampToUnixSeconds(value: string): number | undefined {
  const timestamp = Number.parseInt(value, 10);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return undefined;
  }
  const unixSeconds = Math.floor(timestamp / 1_000_000 - 11_644_473_600);
  return unixSeconds > 0 ? unixSeconds : undefined;
}

type ImportedCookie = Parameters<BrowserContext["addCookies"]>[0][number];

function parseSameSite(value: string): ImportedCookie["sameSite"] | undefined {
  switch (Number.parseInt(value, 10)) {
    case 1:
      return "Lax";
    case 2:
      return "Strict";
    default:
      return undefined;
  }
}

export function listAvailableCookieBrowsers(): SupportedCookieBrowser[] {
  return browserProfiles
    .filter((profile) => existsSync(getCookiesDbPath(profile)))
    .map((profile) => profile.browser);
}

export function listCookieDomains(browser: SupportedCookieBrowser): string[] {
  const profile = getProfile(browser);
  const dbPath = getCookiesDbPath(profile);

  return withCopiedDb(dbPath, (tempDbPath) => {
    const output = querySqlite(
      tempDbPath,
      "SELECT DISTINCT host_key FROM cookies WHERE host_key <> '' ORDER BY host_key;"
    );
    if (output.length === 0) {
      return [];
    }
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  });
}

export function importCookiesForDomains(
  browser: SupportedCookieBrowser,
  domains: string[]
): ImportedCookie[] {
  const profile = getProfile(browser);
  const dbPath = getCookiesDbPath(profile);
  const uniqueDomains = [...new Set(domains.map((domain) => domain.trim()).filter(Boolean))];

  if (uniqueDomains.length === 0) {
    throw new Error("At least one --domain value is required.");
  }

  return withCopiedDb(dbPath, (tempDbPath) => {
    const sqlDomains = uniqueDomains.map(sqlQuote).join(",");
    const output = querySqlite(
      tempDbPath,
      [
        "SELECT",
        "host_key,",
        "name,",
        "path,",
        "expires_utc,",
        "is_secure,",
        "is_httponly,",
        "hex(encrypted_value),",
        "COALESCE(value, ''),",
        "COALESCE(samesite, -1)",
        "FROM cookies",
        `WHERE host_key IN (${sqlDomains})`,
        "ORDER BY host_key, name;"
      ].join(" ")
    );

    if (output.length === 0) {
      return [];
    }

    return output
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("\t");
        if (parts.length < 9) {
          throw new Error(`Unexpected cookie row shape: ${line}`);
        }

        const domain = parts[0] ?? "";
        const name = parts[1] ?? "";
        const cookiePath = parts[2] ?? "/";
        const expiresUtc = parts[3] ?? "0";
        const isSecure = parts[4] ?? "0";
        const isHttpOnly = parts[5] ?? "0";
        const encryptedHex = parts[6] ?? "";
        const plaintextValue = parts[7] ?? "";
        const sameSiteValue = parts[8] ?? "-1";

        const value =
          plaintextValue.length > 0
            ? plaintextValue
            : decryptChromiumValue(encryptedHex, profile.safeStorageService);

        const expires = chromeTimestampToUnixSeconds(expiresUtc);
        const sameSite = parseSameSite(sameSiteValue);

        const cookie: ImportedCookie = {
          domain,
          name,
          path: cookiePath,
          value,
          secure: isSecure === "1",
          httpOnly: isHttpOnly === "1",
          ...(expires !== undefined ? { expires } : {}),
          ...(sameSite !== undefined ? { sameSite } : {})
        };

        return cookie;
      });
  });
}
