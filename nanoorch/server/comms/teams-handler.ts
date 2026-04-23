import type { Request, Response } from "express";
import { storage } from "../storage";
import { executeTask } from "../engine/executor";


const TASK_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates a task UUID and returns it; throws if invalid. */
function requireTaskUUID(id: string): string {
  if (!TASK_UUID_RE.test(id)) throw new Error(`Not a valid task UUID: ${id}`);
  return id;
}

export interface TeamsChannelConfig {
  appId?: string;
  appPassword?: string;
  defaultAgentId?: string;
  url?: string;
  events?: string[];
  isInbound?: boolean;
  allowedUsers?: string[];
}

interface TeamsOAuthToken {
  access_token: string;
  expires_at: number;
}

const tokenCache = new Map<string, TeamsOAuthToken>();

/**
 * Microsoft Bot Connector base URL — sourced from server-side env var only.
 * Never derived from activity.serviceUrl (HTTP request body) to prevent SSRF.
 * Default: https://smba.trafficmanager.net/apis (global Bot Connector endpoint).
 * For regional deployments set TEAMS_BOT_BASE_URL to the appropriate endpoint.
 */
function getTeamsBotBaseUrl(): string {
  const envVal = process.env.TEAMS_BOT_BASE_URL ?? "";
  if (!envVal) return "https://smba.trafficmanager.net/apis";
  try {
    const u = new URL(envVal);
    if (u.protocol !== "https:") return "https://smba.trafficmanager.net/apis";
    return `https://${u.host}`;
  } catch {
    return "https://smba.trafficmanager.net/apis";
  }
}

export async function getTeamsBotToken(appId: string, appPassword: string): Promise<string> {
  const cached = tokenCache.get(appId);
  if (cached && cached.expires_at > Date.now() + 60_000) return cached.access_token;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: appId,
    client_secret: appPassword,
    scope: "https://api.botframework.com/.default",
  });

  const res = await fetch(
    "https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token",
    { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } },
  );
  if (!res.ok) throw new Error(`Teams token fetch failed: ${res.status}`);
  const data = await res.json() as any;
  const token: TeamsOAuthToken = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  tokenCache.set(appId, token);
  return token.access_token;
}

async function verifyTeamsJwt(authHeader: string): Promise<boolean> {
  if (!authHeader?.startsWith("Bearer ")) return false;
  try {
    const [, payload64] = authHeader.slice(7).split(".");
    const payload = JSON.parse(Buffer.from(payload64, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return false;
    if (payload.iss) {
      let issuer: URL;
      try { issuer = new URL(String(payload.iss)); } catch { return false; }
      const issHost = issuer.hostname.toLowerCase();
      if (!issHost.endsWith(".botframework.com") && !issHost.endsWith(".microsoftonline.com") && !issHost.endsWith(".microsoft.com") && !issHost.endsWith(".windows.net")) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Sends a reply to a Teams conversation.
 * The outbound endpoint is always sourced from TEAMS_BOT_BASE_URL (env var),
 * never from the inbound activity.serviceUrl, eliminating the SSRF vector.
 */
export async function replyToTeams(
  _serviceUrl: string,
  conversationId: string,
  activityId: string,
  text: string,
  appId: string,
  appPassword: string,
): Promise<void> {
  // Use the hardcoded/env-configured base URL — _serviceUrl is ignored to prevent SSRF.
  const base = getTeamsBotBaseUrl();
  const replyUrl = new URL(`${base}/v3/conversations/${encodeURIComponent(conversationId)}/activities/${encodeURIComponent(activityId)}`);
  const token = await getTeamsBotToken(appId, appPassword);
  await fetch(replyUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "message", text }),
    signal: AbortSignal.timeout(15_000),
  });
}

async function sendTeamsTyping(
  _serviceUrl: string,
  conversationId: string,
  appId: string,
  appPassword: string,
): Promise<void> {
  try {
    // Use the hardcoded/env-configured base URL — _serviceUrl is ignored to prevent SSRF.
    const base = getTeamsBotBaseUrl();
    const typingUrl = new URL(`${base}/v3/conversations/${encodeURIComponent(conversationId)}/activities`);
    const token = await getTeamsBotToken(appId, appPassword);
    await fetch(typingUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "typing" }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    // Typing indicator is best-effort
  }
}

const BYPASS_PHRASES = [
  "without approval",
  "skip approval",
  "approval not needed",
  "no approval needed",
  "bypass approval",
];

async function handleTeamsCommand(
  command: string,
  _args: string,
  thread: Awaited<ReturnType<typeof storage.getCommsThreadById>> & {},
  cfg: TeamsChannelConfig,
  activity: any,
): Promise<void> {
  const ref = ((thread?.conversationRef as Record<string, string>) ?? {});
  const serviceUrl = ref.serviceUrl ?? activity.serviceUrl;
  const conversationId = ref.conversationId ?? activity.conversation?.id;
  const activityId = activity.id;
  const appId = cfg.appId!;
  const appPassword = cfg.appPassword!;

  const reply = (text: string) => replyToTeams(serviceUrl, conversationId, activityId, text, appId, appPassword);

  switch (command.toLowerCase()) {
    case "status": {
      const lastTask = await storage.getLastTaskForCommsThread(thread.id);
      if (!lastTask) { await reply("No tasks submitted in this thread yet."); return; }
      const statusEmoji: Record<string, string> = { pending: "⏳", running: "🔄", completed: "✅", failed: "❌" };
      const emoji = statusEmoji[lastTask.status ?? "pending"] ?? "❓";
      let text = `${emoji} Last task: **${lastTask.status}**\n**Input:** ${(lastTask.input ?? "").slice(0, 200)}`;
      if (lastTask.errorMessage) text += `\n**Error:** ${lastTask.errorMessage}`;
      await reply(text);
      return;
    }

    case "reset": {
      await storage.resetCommsThreadHistory(thread.id);
      await reply("✅ Conversation context has been reset. Starting fresh.");
      return;
    }

    case "compact": {
      const history = (thread.history as Array<{ role: string; content: string }>) ?? [];
      if (history.length < 4) { await reply("Not enough history to compact yet (need at least 4 messages)."); return; }
      const orchestrator = await storage.getOrchestratorForChannel(thread.channelId);
      if (!orchestrator) { await reply("Cannot compact: orchestrator not found."); return; }
      try {
        const { runAgent } = await import("../providers");
        const historyText = history.map((h) => `${h.role.toUpperCase()}: ${h.content}`).join("\n\n");
        const result = await runAgent({
          provider: orchestrator.provider,
          model: orchestrator.model,
          baseUrl: orchestrator.baseUrl,
          systemPrompt: "You are a conversation summarizer. Produce a concise summary preserving key facts, decisions, and context.",
          messages: [{ role: "user", content: historyText }],
          maxTokens: 1024,
        });
        const summary = result.content;
        await storage.resetCommsThreadHistory(thread.id);
        await storage.appendCommsThreadHistory(thread.id, { role: "system", content: `Previous conversation summary:\n${summary}` });
        await reply(`✅ Conversation compacted.\n\n${summary}`);
      } catch (err: any) {
        await reply(`Failed to compact: ${err?.message ?? String(err)}`);
      }
      return;
    }

    case "help": {
      const orchestrator = await storage.getOrchestratorForChannel(thread.channelId);
      const agents = orchestrator ? await storage.listAgents(orchestrator.id) : [];
      const agentList = agents.length > 0
        ? agents.map((a) => `• \`use ${a.name}: <prompt>\` — ${a.description ?? a.name}`).join("\n")
        : "No agents configured.";
      const helpText = [
        "**NanoOrch Commands**",
        "",
        "**Agent routing:**",
        agentList,
        "",
        "**Commands:**",
        "• `/status` — Show last task status",
        "• `/reset` — Clear conversation history",
        "• `/compact` — Summarize and compress history",
        "• `/help` — Show this help message",
        "",
        "**Approval bypass:** Add \"without approval\" or \"bypass approval\" to skip approval gates.",
      ].join("\n");
      await reply(helpText);
      return;
    }

    default:
      await reply(`Unknown command: \`/${command}\`. Try \`/help\`.`);
  }
}

export async function handleTeamsInteraction(channelId: string, req: Request, res: Response): Promise<void> {
  const channel = await storage.getChannel(channelId);
  if (!channel) { res.status(404).json({ error: "channel not found" }); return; }

  const cfg = channel.config as TeamsChannelConfig;
  const activity = req.body as any;

  res.status(200).json({});

  if (activity.type !== "invoke") return;

  const value = activity.value as any;
  const approvalId = value?.approvalId;
  const resolution = value?.resolution;
  if (!approvalId || !resolution) return;

  setImmediate(async () => {
    try {
      const approval = await storage.getApprovalRequest(approvalId);
      if (!approval || approval.status !== "pending") return;

      const status = resolution === "approved" ? "approved" : "rejected";
      await storage.resolveApprovalRequest(approvalId, activity.from?.name ?? "teams-user", "", status);

      const conversationId = activity.conversation?.id;
      const activityId = activity.id;
      if (!conversationId || !activityId || !cfg.appId || !cfg.appPassword) return;

      const replyText = status === "approved"
        ? `✅ Approval granted for: ${approval.action}`
        : `❌ Approval rejected for: ${approval.action}`;
      // Pass empty string for serviceUrl — replyToTeams ignores it and uses env-configured base
      await replyToTeams("", conversationId, activityId, replyText, cfg.appId, cfg.appPassword);

      if (status === "approved" && approval.taskId) {
        const originalTask = await storage.getTask(approval.taskId);
        if (originalTask) {
          const newTask = await storage.createTask({
            orchestratorId: originalTask.orchestratorId,
            agentId: originalTask.agentId ?? undefined,
            channelId: originalTask.channelId ?? undefined,
            commsThreadId: originalTask.commsThreadId ?? undefined,
            input: `${originalTask.input}\n\n[System: Approval has been granted for action "${approval.action}". Please proceed with the approved action.]`,
            status: "pending",
            priority: originalTask.priority ?? 5,
            bypassApproval: true,
          });
          try { const safeId = requireTaskUUID(newTask.id); setImmediate(() => executeTask(safeId).catch(console.error)); } catch { /* invalid ID */ }
        }
      }
    } catch (err) {
      console.error("[teams-handler] invoke error:", err);
    }
  });
}

export async function handleTeamsEvent(channelId: string, req: Request, res: Response): Promise<void> {
  const channel = await storage.getChannel(channelId);
  if (!channel) { res.status(404).json({ error: "channel not found" }); return; }

  const cfg = channel.config as TeamsChannelConfig;
  if (!cfg?.isInbound) { res.status(403).json({ error: "not an inbound channel" }); return; }

  const authHeader = req.headers["authorization"] as string;
  const valid = await verifyTeamsJwt(authHeader);
  if (!valid) { res.status(401).json({ error: "invalid token" }); return; }

  const activity = req.body as any;

  if (activity.type === "invoke") {
    await handleTeamsInteraction(channelId, req, res);
    return;
  }

  if (activity.type !== "message") { res.status(200).json({}); return; }

  res.status(200).json({});

  setImmediate(async () => {
    try {
      await processTeamsMessage(channelId, cfg, activity);
    } catch (err) {
      console.error("[teams-handler] processTeamsMessage error:", err);
    }
  });
}

async function processTeamsMessage(channelId: string, cfg: TeamsChannelConfig, activity: any): Promise<void> {
  const rawText = (typeof activity.text === "string" ? activity.text : "")
    .slice(0, 100_000)
    .replace(/<[^>]{0,500}>/g, "")
    .trim();
  if (!rawText) return;

  const externalUserId = activity.from?.id ?? "";
  const externalUserName = activity.from?.name;

  if (cfg.allowedUsers && cfg.allowedUsers.length > 0 && !cfg.allowedUsers.includes(externalUserId)) {
    const conversationId = activity.conversation?.id;
    const activityId = activity.id;
    if (conversationId && activityId && cfg.appId && cfg.appPassword) {
      // Pass empty string for serviceUrl — replyToTeams ignores it and uses env-configured base
      await replyToTeams("", conversationId, activityId, "You are not authorized to use this bot.", cfg.appId, cfg.appPassword);
    }
    return;
  }

  const agentNameMatch = rawText.match(/^use\s+([\w-]+)\s*:\s*([\s\S]*)/i);
  const prompt = agentNameMatch ? agentNameMatch[2].trim() : rawText;
  const agentName = agentNameMatch ? agentNameMatch[1] : null;

  const orchestrator = await storage.getOrchestratorForChannel(channelId);
  if (!orchestrator) return;

  let agentId = cfg.defaultAgentId;
  if (agentName) {
    const agents = await storage.listAgents(orchestrator.id);
    const matched = agents.find((a) => a.name.toLowerCase() === agentName!.toLowerCase());
    if (matched) agentId = matched.id;
  }
  if (!agentId) {
    const agents = await storage.listAgents(orchestrator.id);
    if (agents.length > 0) agentId = agents[0].id;
  }
  if (!agentId) return;

  const conversationId = activity.conversation?.id;
  const activityId = activity.id;
  const serviceUrl = activity.serviceUrl;
  const threadKey = conversationId || activityId;

  let thread = await storage.getCommsThread(channelId, threadKey);
  if (!thread) {
    thread = await storage.createCommsThread({
      channelId,
      externalThreadId: threadKey,
      externalChannelId: conversationId,
      externalUserId,
      externalUserName,
      agentId,
      platform: "teams",
      conversationRef: {
        serviceUrl,
        conversationId,
        activityId,
        appId: cfg.appId,
        appPassword: cfg.appPassword,
      },
      lastActivityAt: new Date(),
    });
  } else {
    await storage.touchCommsThread(thread.id);
    const ref = ((thread.conversationRef as Record<string, unknown>) ?? {});
    await storage.updateCommsThreadRef(thread.id, { ...ref, activityId });
  }

  if (prompt.startsWith("/")) {
    const [cmd, ...rest] = prompt.slice(1).split(/\s+/);
    await handleTeamsCommand(cmd, rest.join(" "), thread as any, cfg, activity);
    return;
  }

  if (conversationId && cfg.appId && cfg.appPassword) {
    // Pass empty string for serviceUrl — sendTeamsTyping ignores it and uses env-configured base
    await sendTeamsTyping("", conversationId, cfg.appId, cfg.appPassword);
  }

  const imageAttachments: string[] = [];
  if (activity.attachments && Array.isArray(activity.attachments)) {
    for (const att of activity.attachments) {
      if (att.contentType?.startsWith("image/") && att.name) {
        imageAttachments.push(`[Image: ${att.name}]`);
      }
    }
  }

  const fullPrompt = imageAttachments.length > 0 ? `${prompt}\n\n${imageAttachments.join("\n")}` : prompt;
  const lowerPrompt = fullPrompt.toLowerCase();
  const bypassApproval = BYPASS_PHRASES.some((p) => lowerPrompt.includes(p));

  const task = await storage.createTask({
    orchestratorId: orchestrator.id,
    agentId,
    channelId,
    commsThreadId: thread.id,
    input: fullPrompt,
    status: "pending",
    priority: 5,
    bypassApproval,
  });

  try { const safeId = requireTaskUUID(task.id); setImmediate(() => executeTask(safeId).catch(console.error)); } catch { /* invalid ID */ }
}
