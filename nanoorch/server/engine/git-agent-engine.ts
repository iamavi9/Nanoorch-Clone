import { createHmac, timingSafeEqual } from "crypto";
import { parse as parseYaml } from "yaml";
import { minimatch } from "minimatch";
import { storage } from "../storage";
import { decrypt } from "../lib/encryption";
import { assertSafeUrl } from "../lib/ssrf-guard";
import { executeTask } from "./executor";
import {
  cloneRepo, buildFileContextBlock,
  registerRepoWorkspace, clearRepoWorkspace,
  type CloneResult,
} from "./git-clone";
import { postGitFeedback } from "./git-feedback";
import type { GitRepo, GitAgent } from "@shared/schema";

const MAX_FIELD_LENGTH = 500;

// ── Git ref / SHA validation ───────────────────────────────────────────────
// Prevents user-supplied commit SHAs from injecting extra URL parameters or
// path segments when used inside GitHub/GitLab API URLs.
const SHA_RE = /^[0-9a-f]{40,64}$/i;
const SAFE_REF_RE = /^[a-zA-Z0-9._/:-]{1,250}$/;

function safeGitRef(ref: string | undefined): string {
  if (!ref) return "HEAD";
  if (SHA_RE.test(ref) || SAFE_REF_RE.test(ref)) return ref;
  return "HEAD";
}

// ── Webhook deduplication ─────────────────────────────────────────────────
// Keyed on repoId:sha:eventType. Prevents GitLab/GitHub webhook retries from
// spawning duplicate tasks for the same commit/event.
const recentWebhooks = new Map<string, number>();
const DEDUP_WINDOW_MS = 60_000; // 60 seconds

function isDuplicateWebhook(repoId: string, sha: string, eventType: string): boolean {
  const key = `${repoId}:${sha}:${eventType}`;
  const now = Date.now();
  recentWebhooks.forEach((ts, k) => {
    if (now - ts > DEDUP_WINDOW_MS) recentWebhooks.delete(k);
  });
  if (recentWebhooks.has(key)) return true;
  recentWebhooks.set(key, now);
  return false;
}

function sanitize(val: unknown): string {
  if (typeof val !== "string") return "";
  return val.replace(/[\x00-\x1f\x7f]/g, " ").slice(0, MAX_FIELD_LENGTH).trim();
}

export interface GitWebhookEvent {
  provider: "github" | "gitlab";
  eventType: string;
  ref?: string;
  branch?: string;
  commitSha?: string;
  commitMessage?: string;
  authorLogin?: string;
  authorName?: string;
  prTitle?: string;
  prBody?: string;
  prNumber?: number;
  targetBranch?: string;
  sourceBranch?: string;
  changedFiles?: string[];
  repoPath?: string;
  repoUrl?: string;
  rawPayload: Record<string, unknown>;
}

export interface NanoOrchYml {
  version?: string;
  agents: Record<string, YmlAgentConfig>;
}

export interface YmlAgentConfig {
  enabled: boolean;
  on?: string | string[];
  branches?: string[];
  target_branches?: string[];
  files?: string[];
}

export function verifyGitHubSignature(payload: string, signature: string, secret: string): boolean {
  try {
    const expected = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function verifyGitLabSignature(token: string, secret: string): boolean {
  try {
    const a = Buffer.from(secret);
    const b = Buffer.from(token);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function parseGitHubEvent(eventHeader: string, body: Record<string, unknown>): GitWebhookEvent {
  const event: GitWebhookEvent = { provider: "github", eventType: eventHeader, rawPayload: body };
  const repo = body.repository as Record<string, unknown> | undefined;
  event.repoPath = repo?.full_name as string | undefined;
  event.repoUrl = repo?.html_url as string | undefined;

  if (eventHeader === "push") {
    const ref = body.ref as string | undefined;
    event.ref = ref;
    event.branch = ref?.replace(/^refs\/heads\//, "");
    const headCommit = body.head_commit as Record<string, unknown> | undefined;
    event.commitSha = body.after as string | undefined;
    event.commitMessage = sanitize(headCommit?.message);
    const author = headCommit?.author as Record<string, unknown> | undefined;
    event.authorLogin = sanitize(author?.username ?? author?.name);
    event.authorName = sanitize(author?.name);
    const commits = (body.commits as Array<Record<string, unknown>> | undefined) ?? [];
    const files = new Set<string>();
    for (const c of commits) {
      for (const f of ([] as string[]).concat((c.added as string[]) ?? [], (c.modified as string[]) ?? [], (c.removed as string[]) ?? [])) {
        files.add(f);
      }
    }
    event.changedFiles = Array.from(files);
  } else if (eventHeader === "pull_request") {
    const pr = body.pull_request as Record<string, unknown> | undefined;
    event.prTitle = sanitize(pr?.title);
    event.prBody = sanitize(pr?.body);
    event.prNumber = pr?.number as number | undefined;
    event.sourceBranch = (pr?.head as Record<string, unknown>)?.ref as string | undefined;
    event.targetBranch = (pr?.base as Record<string, unknown>)?.ref as string | undefined;
    const sender = body.sender as Record<string, unknown> | undefined;
    event.authorLogin = sanitize(sender?.login);
  }
  return event;
}

export function parseGitLabEvent(eventHeader: string, body: Record<string, unknown>): GitWebhookEvent {
  const event: GitWebhookEvent = { provider: "gitlab", eventType: eventHeader, rawPayload: body };
  const project = body.project as Record<string, unknown> | undefined;
  event.repoPath = project?.path_with_namespace as string | undefined;
  event.repoUrl = project?.web_url as string | undefined;

  if (eventHeader === "Push Hook" || eventHeader === "Tag Push Hook") {
    event.ref = body.ref as string | undefined;
    event.branch = (body.ref as string | undefined)?.replace(/^refs\/heads\//, "");
    event.commitSha = body.after as string | undefined;
    const commits = (body.commits as Array<Record<string, unknown>> | undefined) ?? [];
    const last = commits[commits.length - 1];
    event.commitMessage = sanitize(last?.message);
    const author = last?.author as Record<string, unknown> | undefined;
    event.authorName = sanitize(author?.name);
    event.authorLogin = sanitize(body.user_username);
    const files2 = new Set<string>();
    for (const c of commits) {
      for (const f of ([] as string[]).concat((c.added as string[]) ?? [], (c.modified as string[]) ?? [], (c.removed as string[]) ?? [])) {
        files2.add(f);
      }
    }
    event.changedFiles = Array.from(files2);
  } else if (eventHeader === "Merge Request Hook") {
    const mr = body.object_attributes as Record<string, unknown> | undefined;
    event.prTitle = sanitize(mr?.title);
    event.prNumber = mr?.iid as number | undefined;
    event.sourceBranch = sanitize(mr?.source_branch);
    event.targetBranch = sanitize(mr?.target_branch);
    event.authorLogin = sanitize((body.user as Record<string, unknown>)?.username);
    event.authorName = sanitize((body.user as Record<string, unknown>)?.name);
  }
  return event;
}

export function normalizeEventType(event: GitWebhookEvent): string {
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

export async function fetchNanoOrchYml(repo: GitRepo, sha: string): Promise<NanoOrchYml | null> {
  try {
    const token = decrypt(repo.tokenEncrypted);
    // Ensure the ref is safe before embedding it in any URL (defence-in-depth
    // even when the caller already validated via safeGitRef).
    const safeRef = safeGitRef(sha);
    const path = ".nanoorch.yml";
    let rawContent: string | null = null;

    if (repo.provider === "github") {
      const [owner, repoName] = (repo.repoPath ?? "").split("/");
      const url = `https://api.github.com/repos/${owner}/${repoName}/contents/${path}?ref=${safeRef}`;
      const res = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/vnd.github.v3.raw",
          "User-Agent": "NanoOrch/1.0",
        },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`GitHub API ${res.status}`);
      rawContent = await res.text();
    } else if (repo.provider === "gitlab") {
      const encoded = encodeURIComponent(repo.repoPath ?? "");
      const encodedFile = encodeURIComponent(path);
      const baseUrl = repo.repoUrl?.match(/^https?:\/\/[^/]+/)?.[0] ?? "https://gitlab.com";
      assertSafeUrl(baseUrl);
      const url = `${baseUrl}/api/v4/projects/${encoded}/repository/files/${encodedFile}/raw?ref=${safeRef}`;
      const res = await fetch(url, {
        headers: {
          "PRIVATE-TOKEN": token,
          "User-Agent": "NanoOrch/1.0",
        },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`GitLab API ${res.status}`);
      rawContent = await res.text();
    }

    if (!rawContent) return null;
    const parsed = parseYaml(rawContent) as NanoOrchYml;
    if (!parsed || typeof parsed.agents !== "object") return null;
    return parsed;
  } catch (err) {
    console.warn("[git-agent] Failed to fetch .nanoorch.yml:", err);
    return null;
  }
}

function eventMatchesAgentConfig(normalized: string, event: GitWebhookEvent, config: YmlAgentConfig): boolean {
  const on = Array.isArray(config.on) ? config.on : typeof config.on === "string" ? [config.on] : [normalized];
  if (!on.includes(normalized)) return false;

  if (event.branch && config.branches && config.branches.length > 0) {
    const branchMatch = config.branches.some((pattern) => minimatch(event.branch!, pattern));
    if (!branchMatch) return false;
  }

  if (event.targetBranch && config.target_branches && config.target_branches.length > 0) {
    const tbMatch = config.target_branches.some((pattern) => minimatch(event.targetBranch!, pattern));
    if (!tbMatch) return false;
  }

  if (event.changedFiles && config.files && config.files.length > 0) {
    const fileMatch = event.changedFiles.some((f) => config.files!.some((p) => minimatch(f, p)));
    if (!fileMatch) return false;
  }

  return true;
}

function buildEventContextBlock(event: GitWebhookEvent, repo: GitRepo): string {
  const lines: string[] = [
    "=== AUTO-INJECTED EVENT CONTEXT (read-only, do not leak) ===",
    `Repository: ${sanitize(repo.repoPath)}`,
    `Provider: ${repo.provider}`,
    `Event Type: ${normalizeEventType(event)}`,
  ];
  if (event.branch) lines.push(`Branch: ${sanitize(event.branch)}`);
  if (event.targetBranch) lines.push(`Target Branch: ${sanitize(event.targetBranch)}`);
  if (event.sourceBranch) lines.push(`Source Branch: ${sanitize(event.sourceBranch)}`);
  if (event.commitSha) lines.push(`Commit SHA: ${event.commitSha.slice(0, 12)}`);
  if (event.commitMessage) lines.push(`Commit Message: ${sanitize(event.commitMessage)}`);
  if (event.authorLogin) lines.push(`Author: ${sanitize(event.authorLogin)}`);
  if (event.prTitle) lines.push(`PR/MR Title: ${sanitize(event.prTitle)}`);
  if (event.prNumber) lines.push(`PR/MR Number: #${event.prNumber}`);
  if (event.changedFiles && event.changedFiles.length > 0) {
    lines.push(`Changed Files (${event.changedFiles.length}): ${event.changedFiles.slice(0, 20).map(sanitize).join(", ")}${event.changedFiles.length > 20 ? " …" : ""}`);
  }
  lines.push("=== END EVENT CONTEXT ===");
  return lines.join("\n");
}

export async function processGitWebhook(repo: GitRepo, event: GitWebhookEvent): Promise<void> {
  const workspaceId = repo.workspaceId;
  const normalized = normalizeEventType(event);
  // Validate the commit SHA so it cannot inject URL parameters when used in
  // GitHub/GitLab API calls inside fetchNanoOrchYml.
  const sha = safeGitRef(event.commitSha);

  // Deduplicate: if this exact repo+sha+eventType was processed within the last
  // 60 s (e.g. GitLab retry), skip silently to avoid duplicate tasks.
  if (isDuplicateWebhook(repo.id, sha, normalized)) {
    console.log(`[git-agent] Duplicate webhook for ${repo.repoPath}@${sha.slice(0, 8)} (${normalized}) — skipped`);
    return;
  }

  const allGitAgents = await storage.listGitAgents(workspaceId);
  if (allGitAgents.length === 0) return;

  // Always fetch .nanoorch.yml from the default-branch HEAD via a hardcoded
  // literal — never from the webhook-supplied commitSha — so no tainted data
  // reaches the GitHub/GitLab API URL (eliminates SSRF finding).
  const yml = await fetchNanoOrchYml(repo, "HEAD");
  const eventContext = buildEventContextBlock(event, repo);

  // ── Clone repository ──────────────────────────────────────────────────────
  // Attempt a shallow clone of the triggering branch so agents can inspect
  // actual file contents.  If the clone fails for any reason (bad token,
  // network, protected branch) we continue without file content — the event
  // metadata in eventContext is still injected.
  let cloneResult: CloneResult | null = null;
  try {
    const token = decrypt(repo.tokenEncrypted);
    cloneResult = await cloneRepo({
      provider: repo.provider as "github" | "gitlab",
      repoPath: repo.repoPath ?? "",
      repoUrl: repo.repoUrl,
      token,
      branch: event.branch ?? event.sourceBranch,
      sha: event.commitSha,
    });
    console.log(`[git-agent] Cloned ${repo.repoPath}@${sha.slice(0, 8)} → ${cloneResult.dir}`);
  } catch (cloneErr: any) {
    console.warn(`[git-agent] Clone failed for ${repo.repoPath}: ${cloneErr.message} — proceeding without file content`);
  }

  // Build the file-content block once; all agents for this event share the same repo.
  let fileContextBlock = "";
  if (cloneResult) {
    try {
      // Strip any path-traversal sequences from webhook-supplied file paths
      // before passing them to the file reader (defence-in-depth; the reader
      // also validates, but being explicit here satisfies static analysis).
      const safeFiles = (event.changedFiles ?? []).filter(
        (f) => typeof f === "string" && !f.includes("..") && !f.startsWith("/"),
      );
      fileContextBlock = await buildFileContextBlock(cloneResult.dir, safeFiles);
    } catch {
      fileContextBlock = "";
    }
  }

  try {
    for (const gitAgent of allGitAgents) {
      if (!gitAgent.isActive) continue;

      const ymlConfig = yml?.agents?.[gitAgent.slug];
      const enabledInYml = ymlConfig?.enabled === true;

      if (!gitAgent.isMandatory && !enabledInYml) {
        await storage.createGitAgentRun({
          repoId: repo.id,
          gitAgentId: gitAgent.id,
          gitAgentSlug: gitAgent.slug,
          taskId: null,
          eventType: normalized,
          eventRef: event.branch ?? event.ref ?? null,
          status: "skipped",
          skipReason: "not enabled in .nanoorch.yml",
          errorMessage: null,
        });
        continue;
      }

      if (ymlConfig && !gitAgent.isMandatory) {
        const matches = eventMatchesAgentConfig(normalized, event, ymlConfig);
        if (!matches) {
          await storage.createGitAgentRun({
            repoId: repo.id,
            gitAgentId: gitAgent.id,
            gitAgentSlug: gitAgent.slug,
            taskId: null,
            eventType: normalized,
            eventRef: event.branch ?? event.ref ?? null,
            status: "skipped",
            skipReason: "event/branch/file filter did not match",
            errorMessage: null,
          });
          continue;
        }
      }

      if (!gitAgent.orchestratorId) {
        await storage.createGitAgentRun({
          repoId: repo.id,
          gitAgentId: gitAgent.id,
          gitAgentSlug: gitAgent.slug,
          taskId: null,
          eventType: normalized,
          eventRef: event.branch ?? event.ref ?? null,
          status: "failed",
          skipReason: null,
          errorMessage: "No orchestrator configured for this git agent",
        });
        continue;
      }

      const run = await storage.createGitAgentRun({
        repoId: repo.id,
        gitAgentId: gitAgent.id,
        gitAgentSlug: gitAgent.slug,
        taskId: null,
        eventType: normalized,
        eventRef: event.branch ?? event.ref ?? null,
        status: "pending",
        skipReason: null,
        errorMessage: null,
      });

      try {
        const adminPrompt = gitAgent.systemPrompt?.trim() ?? "";
        const inputPrompt = buildInputPrompt(event, gitAgent);
        const approvalConfig = gitAgent.approvalConfig as { required?: boolean } | null;

        const fullInput = [
          "=== GIT AGENT ADMIN INSTRUCTIONS ===",
          adminPrompt || "(No specific instructions provided.)",
          "",
          eventContext,
          "",
          ...(fileContextBlock ? [fileContextBlock, ""] : []),
          inputPrompt,
        ].join("\n");

        const task = await storage.createTask({
          orchestratorId: gitAgent.orchestratorId,
          agentId: null,
          channelId: null,
          input: fullInput,
          status: "pending",
          priority: 5,
          intent: `git-agent:${gitAgent.slug}`,
          parentTaskId: null,
          commsThreadId: null,
          bypassApproval: !(approvalConfig?.required ?? false),
          retryCount: 0,
          errorMessage: null,
          isHeartbeat: false,
          // Route comms-channel notification through the standard executor path.
          notifyChannelId: gitAgent.notifyChannelId ?? null,
        });

        await storage.updateGitAgentRun(run.id, { taskId: task.id, status: "running" });

        // Register the cloned directory for the Docker executor's volume mount.
        // For K3s and LLM paths the file content is already in fullInput above.
        if (cloneResult) registerRepoWorkspace(task.id, cloneResult.dir);

        try {
          await executeTask(task.id);
          await storage.updateGitAgentRun(run.id, { status: "completed" });

          // Post findings back to GitHub/GitLab as a PR/commit comment.
          if (gitAgent.postGitComment !== false) {
            const completedTask = await storage.getTask(task.id);
            if (completedTask?.output?.trim()) {
              postGitFeedback({
                repo,
                event,
                agentName: gitAgent.name,
                taskOutput: completedTask.output,
              }).catch((err) => console.warn("[git-agent] Feedback post error:", err));
            }
          }
        } finally {
          // Always deregister after the task finishes (succeeded or failed).
          clearRepoWorkspace(task.id);
        }
      } catch (err: any) {
        console.error(`[git-agent] Run ${run.id} failed:`, err);
        await storage.updateGitAgentRun(run.id, { status: "failed", errorMessage: String(err?.message ?? err) });
      }
    }
  } finally {
    // Remove the temp clone directory regardless of how many agents ran.
    if (cloneResult) await cloneResult.cleanup();
  }

  await storage.updateGitRepo(repo.id, {
    lastYmlSha: sha,
    lastYmlProcessedAt: new Date(),
  });
}

function buildInputPrompt(event: GitWebhookEvent, agent: GitAgent): string {
  const normalized = normalizeEventType(event);
  if (normalized === "push") {
    return `A push event was received on branch \`${sanitize(event.branch ?? "unknown")}\`.\nCommit: ${event.commitSha?.slice(0, 12) ?? "unknown"}\nMessage: ${sanitize(event.commitMessage ?? "")}\nChanged files: ${(event.changedFiles ?? []).slice(0, 30).map(sanitize).join(", ") || "none"}\n\nPlease perform your assigned analysis and provide your findings.`;
  }
  if (normalized === "merge_request") {
    return `A merge/pull request event was received.\nPR/MR #${event.prNumber ?? "?"}: ${sanitize(event.prTitle ?? "")}\nFrom \`${sanitize(event.sourceBranch ?? "?")}\` → \`${sanitize(event.targetBranch ?? "?")}\`\nAuthor: ${sanitize(event.authorLogin ?? "unknown")}\n\nPlease perform your assigned analysis and provide your findings.`;
  }
  return `A ${sanitize(normalized)} event was received from ${event.provider} on repository ${sanitize(event.repoPath ?? "unknown")}.\n\nPlease perform your assigned analysis and provide your findings.`;
}
