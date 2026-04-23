/**
 * git-feedback.ts
 *
 * Posts git agent findings back to GitHub/GitLab as PR/commit comments.
 * Called by git-agent-engine after each task completes.
 *
 * Security note: GitLab base URL is sourced from the GITLAB_BASE_URL environment
 * variable (server configuration), not from any user-supplied or database value,
 * to prevent SSRF. Self-hosted GitLab instances must set this env var server-side.
 */

import type { GitRepo } from "@shared/schema";
import { decrypt } from "../lib/encryption";
import type { GitWebhookEvent } from "./git-agent-engine";

/** Inline copy — avoids circular import with git-agent-engine. */
function normalizeEventType(event: GitWebhookEvent): string {
  if (event.provider === "github") {
    if (event.eventType === "push") return "push";
    if (event.eventType === "pull_request") return "merge_request";
    if (event.eventType === "workflow_run") return "pipeline";
    return event.eventType;
  }
  if (event.provider === "gitlab") {
    if (event.eventType === "Push Hook") return "push";
    if (event.eventType === "Tag Push Hook") return "push";
    if (event.eventType === "Merge Request Hook") return "merge_request";
    if (event.eventType === "Pipeline Hook") return "pipeline";
    return event.eventType.toLowerCase().replace(" hook", "").replace(" ", "_");
  }
  return event.eventType;
}

const MAX_COMMENT_LENGTH = 50_000;
const USER_AGENT = "NanoOrch/1.0";

/**
 * GitHub API base URL — always hardcoded; cannot be overridden.
 * All GitHub feedback goes to api.github.com only.
 */
const GITHUB_API_BASE = "https://api.github.com";

/**
 * GitLab API base URL — sourced from server-side env var only.
 * Never derived from user input or database values to prevent SSRF.
 * Default: https://gitlab.com (cloud GitLab).
 * For self-hosted: set GITLAB_BASE_URL=https://your-gitlab.example.com
 */
function getGitlabApiBase(): string {
  const envVal = process.env.GITLAB_BASE_URL ?? "";
  if (!envVal) return "https://gitlab.com";
  try {
    const u = new URL(envVal);
    if (u.protocol !== "https:") return "https://gitlab.com";
    return `https://${u.host}`;
  } catch {
    return "https://gitlab.com";
  }
}

function truncateOutput(text: string): string {
  if (text.length <= MAX_COMMENT_LENGTH) return text;
  return text.slice(0, MAX_COMMENT_LENGTH - 200) +
    "\n\n> ⚠️ _Output truncated — full result is available in NanoOrch._";
}

function formatMarkdownComment(agentName: string, output: string, event: GitWebhookEvent): string {
  const normalized = normalizeEventType(event);
  const eventLine = normalized === "push"
    ? `push to \`${event.branch ?? "unknown"}\``
    : normalized === "merge_request"
      ? `PR/MR #${event.prNumber ?? "?"}: ${event.prTitle ?? ""}`
      : `${normalized} event`;

  const authorPart = event.authorLogin ? ` by @${event.authorLogin}` : "";

  const lines = [
    `## 🤖 NanoOrch — ${agentName}`,
    "",
    `> Triggered by ${eventLine}${authorPart}`,
    "",
    truncateOutput(output.trim()),
    "",
    "---",
    `*Powered by NanoOrch*`,
  ];
  return lines.join("\n");
}

async function postJsonWithRetry(
  url: URL,
  headers: Record<string, string>,
  body: Record<string, string>,
): Promise<void> {
  // url is always a URL object constructed from a hardcoded base — never from user/DB input.
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
}

async function postGitHubComment(
  token: string,
  repoPath: string,
  event: GitWebhookEvent,
  commentBody: string,
): Promise<void> {
  const normalized = normalizeEventType(event);
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": USER_AGENT,
  };

  if (normalized === "merge_request" && event.prNumber) {
    // PR comment — URL built entirely from the hardcoded GITHUB_API_BASE constant
    const url = new URL(`${GITHUB_API_BASE}/repos/${encodeURIComponent(repoPath)}/issues/${event.prNumber}/comments`);
    await postJsonWithRetry(url, headers, { body: commentBody });
    return;
  }

  // Commit comment (push or fallback)
  const sha = event.commitSha;
  if (!sha) {
    console.warn("[git-feedback] GitHub: no SHA to comment on — skipping");
    return;
  }
  const url = new URL(`${GITHUB_API_BASE}/repos/${encodeURIComponent(repoPath)}/commits/${sha}/comments`);
  await postJsonWithRetry(url, headers, { body: commentBody });
}

async function postGitLabComment(
  token: string,
  repoPath: string,
  event: GitWebhookEvent,
  commentBody: string,
): Promise<void> {
  const normalized = normalizeEventType(event);
  const encodedPath = encodeURIComponent(repoPath);
  const headers = { "PRIVATE-TOKEN": token, "User-Agent": USER_AGENT };

  // GitLab base URL is sourced from the server-side env var — never from user/DB input.
  const gitlabBase = getGitlabApiBase();

  if (normalized === "merge_request" && event.prNumber) {
    const url = new URL(`${gitlabBase}/api/v4/projects/${encodedPath}/merge_requests/${event.prNumber}/notes`);
    await postJsonWithRetry(url, headers, { body: commentBody });
    return;
  }

  // Commit comment
  const sha = event.commitSha;
  if (!sha) {
    console.warn("[git-feedback] GitLab: no SHA to comment on — skipping");
    return;
  }
  const url = new URL(`${gitlabBase}/api/v4/projects/${encodedPath}/repository/commits/${sha}/comments`);
  await postJsonWithRetry(url, headers, { note: commentBody });
}

/**
 * Post agent findings back to GitHub/GitLab as a PR or commit comment.
 * Safe to call — all errors are caught and logged, never thrown.
 */
export async function postGitFeedback(opts: {
  repo: GitRepo;
  event: GitWebhookEvent;
  agentName: string;
  taskOutput: string;
}): Promise<void> {
  const { repo, event, agentName, taskOutput } = opts;

  if (!taskOutput?.trim()) {
    console.log("[git-feedback] No output to post — skipping");
    return;
  }

  let token: string;
  try {
    token = decrypt(repo.tokenEncrypted);
  } catch (err) {
    console.warn("[git-feedback] Could not decrypt token — skipping feedback");
    return;
  }

  const commentBody = formatMarkdownComment(agentName, taskOutput, event);
  const repoPath = repo.repoPath ?? "";

  try {
    if (repo.provider === "github") {
      await postGitHubComment(token, repoPath, event, commentBody);
      console.log(`[git-feedback] GitHub comment posted for ${repoPath}`);
    } else if (repo.provider === "gitlab") {
      await postGitLabComment(token, repoPath, event, commentBody);
      console.log(`[git-feedback] GitLab comment posted for ${repoPath}`);
    }
  } catch (err: any) {
    // Never let feedback failure propagate — it's best-effort
    console.warn(`[git-feedback] Failed to post comment for ${repoPath}: ${err?.message ?? err}`);
  }
}
