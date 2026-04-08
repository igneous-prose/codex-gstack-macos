import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

function resolveExistingAncestor(candidatePath: string): string {
  let currentPath = candidatePath;

  while (!existsSync(currentPath)) {
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      throw new Error(`No existing ancestor found for ${candidatePath}`);
    }
    currentPath = parentPath;
  }

  return currentPath;
}

function resolveCandidateRealPath(candidatePath: string): string {
  const absoluteCandidatePath = path.resolve(candidatePath);
  const existingAncestor = resolveExistingAncestor(absoluteCandidatePath);
  const realAncestor = realpathSync(existingAncestor);
  const remainder = path.relative(existingAncestor, absoluteCandidatePath);
  return path.resolve(realAncestor, remainder);
}

function isWithin(basePath: string, candidatePath: string): boolean {
  return candidatePath === basePath || candidatePath.startsWith(`${basePath}${path.sep}`);
}

export function validateOutputPath(repoRoot: string, candidatePath: string): string {
  const resolvedRepoRoot = realpathSync(repoRoot);
  const resolvedTmpRoot = realpathSync("/tmp");
  const resolvedCandidate = resolveCandidateRealPath(candidatePath);

  if (isWithin(resolvedRepoRoot, resolvedCandidate) || isWithin(resolvedTmpRoot, resolvedCandidate)) {
    return resolvedCandidate;
  }

  throw new Error(
    `Refusing to write outside approved paths. Allowed roots: ${resolvedRepoRoot} and ${resolvedTmpRoot}`
  );
}

