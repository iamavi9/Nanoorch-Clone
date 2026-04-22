import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response } from "express";
import { storage } from "../storage";
import { executeTask } from "../engine/executor";

export interface SlackChannelConfig {
  botToken?: string;
  signingSecret?: string;
  defaultAgentId?: string;
  url?: string;
  events?: string[];
  isInbound?: boolean;
  allowedUsers?: string[];
}

const BYPASS_PHRASES = [
  "without approval",
  "skip approval",
  "approval not needed",
  "no approval needed",
  "bypass approval",
];

export function verifySlackSignature(signingSecret: string, req: Request): boolean {
  const timestamp = req.headers["x-slack-request-timestamp"] as string;
  const slackSig = req.headers["x-slack-signature"] as string;
  if (!timestamp || !slackSig) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  const rawBody = (req as any).rawBody as string | undefined;
  if (!rawBody) return false;

  const baseString = `v0:${timestamp}:${rawBody}`;
  const computed = "v0=" + createHmac("sha256", signingSecret).update(baseString).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(slackSig));
  } catch {
    return false;
  }
}

function stripMentions(text: unknown): string {
  const s = typeof text === "string" ? text : String(text ?? "");
  return s.replace(/<@[A-Z0-9]+>/g, "").trim();
}

function parseAgentName(text: string): { agentName: string | null; prompt: string } {
  const match = text.match(/^use\s+([\w-]+)\s*:\s*([\s\S]*)/i);
  if (match) return { agentName: match[1], prompt: match[2].trim() };
  return { agentName: null, prompt: text };
}

async function postSlackMessage(
  botToken: string,
  channel: string,
  threadTs: string,
  text: string,
): Promise<string | null> {
  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel, thread_ts: threadTs, text }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json() as any;
    return data.ok ? (data.ts as string) : null;
  } catch {
    return null;
  }
}

async function sendSlackTypingActivity(botToken: string, channel: string, threadTs: string): Promise<string | null> {
  return postSlackMessage(botToken, channel, threadTs, "⏳ _Thinking…_");
}

async function handleCommand(
  command: string,
  args: string,
  thread: Awaited<ReturnType<typeof storage.getCommsThreadById>> & {},
  cfg: SlackChannelConfig,
  event: any,
): Promise<void> {
  const botToken = cfg.botToken!;
  const slackChannel = event.channel as string;
  const threadTs = event.thread_ts || event.ts;

  switch (command.toLowerCase()) {
    case "status": {
      const lastTask = await storage.getLastTaskForCommsThread(thread.id);
      if (!lastTask) {
        await postSlackMessage(botToken, slackChannel, threadTs, "No tasks have been submitted in this thread yet.");
        return;
      }
      const statusEmoji: Record<string, string> = { pending: "⏳", running: "🔄", completed: "✅", failed: "❌" };
      const emoji = statusEmoji[lastTask.status ?? "pending"] ?? "❓";
      let text = `${emoji} *Last task status:* \`${lastTask.status}\`\n*Input:* ${(lastTask.input ?? "").slice(0, 200)}`;
      if (lastTask.errorMessage) text += `\n*Error:* ${lastTask.errorMessage}`;
      if (lastTask.completedAt) text += `\n*Completed:* <!date^${Math.floor(new Date(lastTask.completedAt).getTime() / 1000)}^{date_short_pretty} at {time}|${lastTask.completedAt}>`;
      await postSlackMessage(botToken, slackChannel, threadTs, text);
      return;
    }

    case "reset": {
      await storage.resetCommsThreadHistory(thread.id);
      await postSlackMessage(botToken, slackChannel, threadTs, "✅ Conversation context has been reset. Starting fresh.");
      return;
    }

    case "compact": {
      const history = (thread.history as Array<{ role: string; content: string }>) ?? [];
      if (history.length < 4) {
        await postSlackMessage(botToken, slackChannel, threadTs, "Not enough history to compact yet (need at least 4 messages).");
        return;
      }
      const orchestrator = await storage.getOrchestratorForChannel(thread.channelId);
      if (!orchestrator) {
        await postSlackMessage(botToken, slackChannel, threadTs, "Cannot compact: orchestrator not found.");
        return;
      }
      try {
        const { runAgent } = await import("../providers");
        const historyText = history.map((h) => `${h.role.toUpperCase()}: ${h.content}`).join("\n\n");
        const result = await runAgent({
          provider: orchestrator.provider,
          model: orchestrator.model,
          baseUrl: orchestrator.baseUrl,
          systemPrompt: "You are a conversation summarizer. Produce a concise summary of the conversation below preserving key facts, decisions, and context that would be needed to continue the conversation.",
          messages: [{ role: "user", content: historyText }],
          maxTokens: 1024,
        });
        const summary = result.content;
        const compactedHistory = [{ role: "system", content: `Previous conversation summary:\n${summary}` }];
        await storage.resetCommsThreadHistory(thread.id);
        for (const entry of compactedHistory) {
          await storage.appendCommsThreadHistory(thread.id, entry);
        }
        await postSlackMessage(botToken, slackChannel, threadTs, `✅ Conversation compacted. Summary:\n\n${summary}`);
      } catch (err: any) {
        await postSlackMessage(botToken, slackChannel, threadTs, `Failed to compact: ${err?.message ?? String(err)}`);
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
        "*NanoOrch Commands*",
        "",
        "*Agent routing:*",
        agentList,
        "",
        "*Commands:*",
        "• `/status` — Show status of the last task in this thread",
        "• `/reset` — Clear conversation history and start fresh",
        "• `/compact` — Summarize and compress the conversation history",
        "• `/help` — Show this help message",
        "",
        "*Approval bypass:*",
        'Add "without approval", "skip approval", or "bypass approval" to your message to skip approval gates.',
      ].join("\n");
      await postSlackMessage(botToken, slackChannel, threadTs, helpText);
      return;
    }

    default:
      await postSlackMessage(botToken, slackChannel, threadTs, `Unknown command: \`/${command}\`. Try \`/help\`.`);
  }
}

export async function handleSlackEvent(channelId: string, req: Request, res: Response): Promise<void> {
  const channel = await storage.getChannel(channelId);
  if (!channel) { res.status(404).json({ error: "channel not found" }); return; }

  const cfg = channel.config as SlackChannelConfig;
  if (!cfg?.isInbound) { res.status(403).json({ error: "not an inbound channel" }); return; }

  if (cfg.signingSecret) {
    if (!verifySlackSignature(cfg.signingSecret, req)) {
      res.status(401).json({ error: "invalid signature" }); return;
    }
  }

  const body = req.body as any;

  if (body.type === "url_verification") {
    res.json({ challenge: body.challenge }); return;
  }

  if (body.type === "event_callback") {
    const event = body.event;

    if (!event || (event.type !== "app_mention" && event.type !== "message")) {
      res.status(200).json({ ok: true }); return;
    }

    if (event.bot_id || event.subtype === "bot_message") {
      res.status(200).json({ ok: true }); return;
    }

    res.status(200).json({ ok: true });

    setImmediate(async () => {
      try {
        await processSlackMessage(channelId, cfg, event);
      } catch (err) {
        console.error("[slack-handler] processSlackMessage error:", err);
      }
    });
    return;
  }

  res.status(200).json({ ok: true });
}

async function processSlackMessage(channelId: string, cfg: SlackChannelConfig, event: any): Promise<void> {
  const rawText = stripMentions(event.text || "");
  if (!rawText) return;

  const slackChannel = event.channel as string;
  const slackUserId = event.user as string;
  const threadTs = event.thread_ts || event.ts;

  if (cfg.allowedUsers && cfg.allowedUsers.length > 0 && !cfg.allowedUsers.includes(slackUserId)) {
    if (cfg.botToken) {
      await postSlackMessage(cfg.botToken, slackChannel, threadTs, "You are not authorized to use this bot.");
    }
    return;
  }

  const { agentName, prompt } = parseAgentName(rawText);
  const isCommand = prompt.startsWith("/");

  const orchestrator = await storage.getOrchestratorForChannel(channelId);
  if (!orchestrator) return;

  let agentId = cfg.defaultAgentId;
  if (agentName) {
    const agents = await storage.listAgents(orchestrator.id);
    const matched = agents.find((a) => a.name.toLowerCase() === agentName.toLowerCase());
    if (matched) agentId = matched.id;
  }
  if (!agentId) {
    const agents = await storage.listAgents(orchestrator.id);
    if (agents.length > 0) agentId = agents[0].id;
  }
  if (!agentId) return;

  let thread = await storage.getCommsThread(channelId, threadTs);
  if (!thread) {
    thread = await storage.createCommsThread({
      channelId,
      externalThreadId: threadTs,
      externalChannelId: slackChannel,
      externalUserId: slackUserId,
      externalUserName: slackUserId,
      agentId,
      platform: "slack",
      conversationRef: {
        channel: slackChannel,
        thread_ts: threadTs,
        botToken: cfg.botToken,
      },
      lastActivityAt: new Date(),
    });
  } else {
    await storage.touchCommsThread(thread.id);
  }

  if (isCommand) {
    const [cmd, ...rest] = prompt.slice(1).split(/\s+/);
    await handleCommand(cmd, rest.join(" "), thread as any, cfg, event);
    return;
  }

  let typingTs: string | null = null;
  if (cfg.botToken) {
    typingTs = await sendSlackTypingActivity(cfg.botToken, slackChannel, threadTs);
  }

  if (typingTs) {
    const ref = ((thread.conversationRef as Record<string, unknown>) ?? {});
    await storage.updateCommsThreadRef(thread.id, { ...ref, typing_ts: typingTs });
  }

  const imageAttachments: string[] = [];
  if (event.files && Array.isArray(event.files)) {
    for (const file of event.files) {
      if (file.mimetype?.startsWith("image/") && file.name) {
        imageAttachments.push(`[Image: ${file.name}]`);
      }
    }
  }

  const fullPrompt = imageAttachments.length > 0
    ? `${prompt}\n\n${imageAttachments.join("\n")}`
    : prompt;

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

  setImmediate(() => executeTask(task.id).catch(console.error));
}
