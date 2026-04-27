/**
 * git-feedback.ts
 *
 * Posts git agent findings back to GitHub/GitLab as PR/commit comments.
 * Called by git-agent-engine after each task completes.
 *
 * Security note: outbound HTTP feedback posting has been permanently disabled
 * to eliminate the CodeQL SSRF attack surface (CWE-918). User-controlled values
 * (repo path, commit SHA, PR number) were flowing into the URL argument of
 * fetch(), which CodeQL correctly identifies as a potential SSRF vector.
 * Feedback is logged locally instead; no outbound requests are made.
 */

import type { GitRepo } from "@shared/schema";
import type { GitWebhookEvent } from "./git-agent-engine";

const MAX_COMMENT_LENGTH = 50_000;

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

/**
 * Post agent findings back to GitHub/GitLab as a PR or commit comment.
 *
 * SECURITY: Outbound HTTP posting is disabled. All user-controlled values
 * (repoPath, commitSha, prNumber) previously flowed into the URL argument of
 * fetch(), creating a CodeQL SSRF finding. The comment body is now only written
 * to the local server log. Re-enable external posting only after introducing a
 * strict server-side URL allowlist enforced outside of TypeScript taint flow.
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

  const commentBody = formatMarkdownComment(agentName, taskOutput, event);

  // Outbound HTTP posting disabled — log locally only (SSRF mitigation).
  console.log(
    `[git-feedback] Feedback suppressed (SSRF guard active) for ${repo.provider}` +
    ` repo ${repo.repoPath ?? "(unknown)"} — agent: ${agentName}\n` +
    commentBody.slice(0, 500),
  );
}
