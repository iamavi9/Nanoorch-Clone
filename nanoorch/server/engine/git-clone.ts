/**
 * Git clone helpers for Git Agent task execution.
 *
 * Clones the repository at the triggering branch/SHA into a temporary
 * directory so the agent can inspect actual file contents — not just the
 * metadata from the webhook payload.
 *
 * Token security: the clone URL includes the PAT/token as a URL credential
 * (standard HTTPS git auth).  It is passed directly to the child-process
 * argv array and is never written to disk or logged.
 */

import { spawn } from "child_process";
import { mkdtemp, rm, readFile, stat } from "fs/promises";
import { existsSync } from "fs";
import { join, extname } from "path";
import { tmpdir } from "os";
import { assertSafeUrl } from "../lib/ssrf-guard";

// ── Constants ──────────────────────────────────────────────────────────────

/** Key project-context files always fetched regardless of changed-file list. */
const CONTEXT_FILES = [
  "README.md", "README.rst", "README.txt",
  "package.json", "pyproject.toml", "Cargo.toml", "go.mod",
  ".nanoorch.yml",
];

/** Extensions treated as binary — skipped silently. */
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico",
  ".pdf", ".zip", ".tar", ".gz", ".bz2", ".xz",
  ".wasm", ".bin", ".exe", ".dll", ".so", ".dylib",
  ".mp4", ".mp3", ".wav", ".ogg",
  ".ttf", ".woff", ".woff2", ".eot",
]);

const MAX_FILE_BYTES  = 10_000;  // 10 KB per file
const MAX_TOTAL_BYTES = 60_000;  // 60 KB total (all files combined)

// ── Docker workspace registry ──────────────────────────────────────────────

/**
 * In-process map from taskId → cloned repo directory.
 * The Docker executor reads this to add a --volume mount so the agent
 * container can access the live repository under /workspace.
 */
const repoWorkspaceMap = new Map<string, string>();

export function registerRepoWorkspace(taskId: string, dir: string): void {
  repoWorkspaceMap.set(taskId, dir);
}

export function getRepoWorkspace(taskId: string): string | undefined {
  return repoWorkspaceMap.get(taskId);
}

export function clearRepoWorkspace(taskId: string): void {
  repoWorkspaceMap.delete(taskId);
}

// ── Git helpers ────────────────────────────────────────────────────────────

function gitSpawn(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "echo" },
    });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`git ${args[0]} failed (exit ${code}): ${stderr.slice(0, 400)}`));
    });
    proc.on("error", (err) => reject(new Error(`git spawn error: ${err.message}`)));
  });
}

// ── Clone ──────────────────────────────────────────────────────────────────

export interface CloneResult {
  /** Absolute path to the cloned repo on disk. */
  dir: string;
  /** Removes the temp directory.  Safe to call multiple times. */
  cleanup: () => Promise<void>;
}

/**
 * Shallow-clone a GitHub or GitLab repository at the default branch HEAD.
 *
 * Security note: branch and sha parameters from the database (originally
 * user-supplied) are NOT passed to any git command arguments to eliminate
 * second-order command injection. The clone always checks out the default
 * branch at HEAD. The branch/sha values are accepted in the opts signature
 * for API compatibility but are intentionally unused in git invocations.
 */
export async function cloneRepo(opts: {
  provider: "github" | "gitlab";
  repoPath: string;
  repoUrl: string | null;
  token: string;
  branch?: string;
  sha?: string;
}): Promise<CloneResult> {
  const { provider, repoPath, repoUrl, token } = opts;
  // branch and sha are intentionally not destructured — they must not reach git args.

  // Validate repoPath before constructing the clone URL.
  // repoPath comes from the database (originally user-supplied) — block path traversal and option injection.
  if (!repoPath || !/^[A-Za-z0-9_.\-\/]+$/.test(repoPath) || repoPath.includes("..")) {
    throw new Error(`[git-clone] Invalid repository path "${repoPath}": only alphanumeric chars, slashes, hyphens, underscores, and dots are allowed`);
  }

  let cloneUrl: string;
  if (provider === "github") {
    cloneUrl = `https://x-access-token:${token}@github.com/${repoPath}.git`;
  } else {
    const baseUrl = repoUrl?.match(/^https:\/\/[^/]+/)?.[0] ?? "https://gitlab.com";
    assertSafeUrl(baseUrl);
    cloneUrl = `${baseUrl.replace(/^https:\/\//, `https://oauth2:${token}@`)}/${repoPath}.git`;
  }

  const dir = await mkdtemp(join(tmpdir(), "nanoorch-git-"));
  const cleanup = async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  };

  try {
    // Always clone the default branch at HEAD.
    // No branch or SHA is passed to git to eliminate command injection vectors.
    await gitSpawn(["clone", "--depth=1", "--single-branch", cloneUrl, dir]);
  } catch (err) {
    await cleanup();
    throw err;
  }

  return { dir, cleanup };
}

// ── File reading ───────────────────────────────────────────────────────────

async function isBinaryFile(filePath: string): Promise<boolean> {
  if (BINARY_EXTENSIONS.has(extname(filePath).toLowerCase())) return true;
  try {
    const { createReadStream } = await import("fs");
    return new Promise((resolve) => {
      const stream = createReadStream(filePath, { start: 0, end: 511 }); // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename -- filePath is bounds-checked by tryReadFile() before calling isBinaryFile()
      const chunks: Buffer[] = [];
      stream.on("data", (c) => chunks.push(c as Buffer));
      stream.on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve(buf.includes(0));
      });
      stream.on("error", () => resolve(true));
    });
  } catch {
    return true;
  }
}

async function tryReadFile(dir: string, relPath: string): Promise<string | null> {
  const { resolve } = await import("path");
  const resolvedDir = resolve(dir);
  const abs = resolve(dir, relPath);
  if (!abs.startsWith(resolvedDir + "/") && abs !== resolvedDir) return null;
  if (!existsSync(abs)) return null; // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename -- abs is path.resolve(dir,relPath), bounds-checked above
  try {
    const s = await stat(abs); // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
    if (!s.isFile() || s.size > MAX_FILE_BYTES * 2) return null;
    if (await isBinaryFile(abs)) return null;
    const content = await readFile(abs, "utf-8"); // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
    if (content.length > MAX_FILE_BYTES) {
      return content.slice(0, MAX_FILE_BYTES) + "\n…(file truncated at 10 KB)";
    }
    return content;
  } catch {
    return null;
  }
}

/**
 * Builds a formatted block containing the content of:
 *  1. Files changed in the triggering event (from the webhook payload)
 *  2. Standard context files (README, package.json, etc.)
 *
 * Total output is capped at MAX_TOTAL_BYTES to avoid overflowing LLM context.
 */
export async function buildFileContextBlock(
  dir: string,
  changedFiles: string[],
): Promise<string> {
  const lines: string[] = ["=== REPOSITORY FILE CONTENT ==="];
  let totalBytes = 0;

  const seen = new Set<string>();

  const addFile = async (relPath: string): Promise<void> => {
    if (totalBytes >= MAX_TOTAL_BYTES) return;
    if (seen.has(relPath)) return;
    seen.add(relPath);
    const content = await tryReadFile(dir, relPath);
    if (content === null) return;
    lines.push(`\n--- ${relPath} ---`);
    lines.push(content);
    totalBytes += content.length;
  };

  for (const f of changedFiles.slice(0, 40)) {
    await addFile(f);
    if (totalBytes >= MAX_TOTAL_BYTES) break;
  }

  for (const f of CONTEXT_FILES) {
    await addFile(f);
    if (totalBytes >= MAX_TOTAL_BYTES) break;
  }

  if (seen.size === 0) {
    lines.push("(No readable text files found in the changed set)");
  } else {
    lines.push(`\n(${seen.size} file(s) included, ${totalBytes.toLocaleString()} bytes total)`);
  }

  lines.push("=== END REPOSITORY FILE CONTENT ===");
  return lines.join("\n");
}
