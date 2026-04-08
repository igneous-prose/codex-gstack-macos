import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const forbiddenPatterns = [
  { label: "claude config", regex: /\bCLAUDE\.md\b|\.claude\//i },
  { label: "telemetry", regex: /\btelemetry\b/i },
  { label: "supabase", regex: /\bsupabase\b/i },
  { label: "ngrok", regex: /\bngrok\b/i },
  { label: "cursor", regex: /\bcursor\b/i },
  { label: "factory", regex: /\bfactory\b/i },
  { label: "kiro", regex: /\bkiro\b/i },
  { label: "opencode", regex: /\bopencode\b/i },
  { label: "openclaw", regex: /\bopenclaw\b/i },
  { label: "slate", regex: /\bslate\b/i },
  { label: "global hook", regex: /\bhook-install\b|\bsession-start hook\b/i }
];

const skippedDirs = new Set([".git", "node_modules", "dist", ".codex-gstack"]);
const contentScanRoots = [
  path.join(repoRoot, "src"),
  path.join(repoRoot, "scripts"),
  path.join(repoRoot, "skills"),
  path.join(repoRoot, ".github")
];
const contentScanIgnoreFiles = new Set([path.join(repoRoot, "scripts", "check-security.mjs")]);

function listFiles(dir) {
  const results = [];

  for (const entry of readdirSync(dir)) {
    if (skippedDirs.has(entry)) {
      continue;
    }

    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      results.push(...listFiles(fullPath));
      continue;
    }

    results.push(fullPath);
  }

  return results;
}

const findings = [];

for (const rootDir of contentScanRoots) {
  for (const filePath of listFiles(rootDir)) {
    if (contentScanIgnoreFiles.has(filePath)) {
      continue;
    }

    const relativePath = path.relative(repoRoot, filePath);
    const content = readFileSync(filePath, "utf8");

    for (const pattern of forbiddenPatterns) {
      if (pattern.regex.test(content)) {
        findings.push(`${pattern.label}: ${relativePath}`);
      }
    }
  }
}

for (const filePath of listFiles(repoRoot)) {
  const relativePath = path.relative(repoRoot, filePath);
  const parts = relativePath.split(path.sep);
  for (const part of parts) {
    for (const pattern of forbiddenPatterns) {
      if (pattern.regex.test(part)) {
        findings.push(`${pattern.label} path: ${relativePath}`);
      }
    }
  }
}

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(finding);
  }
  process.exit(1);
}

const browserDoc = readFileSync(path.join(repoRoot, "docs", "browser.md"), "utf8");
if (!browserDoc.includes("127.0.0.1")) {
  console.error("Browser docs must declare 127.0.0.1 binding");
  process.exit(1);
}

console.log("security: no forbidden integrations or telemetry strings detected");
