import type { Request, Response } from "express";
import { storage } from "../storage";
import { executeTask } from "../engine/executor";
import { assertSafeUrl } from "../lib/ssrf-guard";

const TASK_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface GoogleChatChannelConfig {
  url?: string;
  events?: string[];
  isInbound?: boolean;
  defaultAgentId?: string;
  verificationToken?: string;
}

const BYPASS_PHRASES = [
  "without approval",
  "skip approval",
  "approval not needed",
  "no approval needed",
  "bypass approval",
];

function stripBotMention(text: string): string {
  return text.replace(/<[^>]*>/g, "").trim();
}

async function postGoogleChatReply(webhookUrl: string, text: string): Promise<void> {
  try {
    assertSafeUrl(webhookUrl);
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error("[google-chat] Failed to post reply:", err);
  }
}

export async function handleGoogleChatEvent(channelId: string, req: Request, res: Response): Promise<void> {
  const channel = await storage.getChannel(channelId);
  if (!channel) { res.status(404).json({ error: "channel not found" }); return; }

  const cfg = channel.config as GoogleChatChannelConfig;
  if (!cfg?.isInbound) { res.status(403).json({ error: "not an inbound channel" }); return; }

  const body = req.body as any;

  if (cfg.verificationToken && body.token && body.token !== cfg.verificationToken) {
    res.status(401).json({ error: "invalid token" }); return;
  }

  const eventType: string = body.type ?? "";

  if (eventType === "ADDED_TO_SPACE") {
    res.json({ text: "👋 NanoOrch is now active in this space. Mention me or send a message to get started." });
    return;
  }

  if (eventType === "REMOVED_FROM_SPACE") {
    res.status(200).json({});
    return;
  }

  if (eventType !== "MESSAGE" && eventType !== "CARD_CLICKED") {
    res.status(200).json({ text: "OK" });
    return;
  }

  const message = body.message ?? body;
  const rawText: string = message?.text ?? message?.argumentText ?? "";
  const text = stripBotMention(rawText);
  if (!text) { res.status(200).json({ text: "⏳ Received." }); return; }

  const sender = body.user ?? message?.sender ?? {};
  const senderName: string = sender.displayName ?? sender.name ?? "unknown";
  const senderId: string = sender.name ?? senderName;

  const space = body.space ?? message?.space ?? {};
  const spaceName: string = space.name ?? "unknown-space";

  const thread = message?.thread ?? {};
  const threadName: string = thread.name ?? spaceName;

  res.json({ text: "⏳ _NanoOrch is thinking…_" });

  setImmediate(async () => {
    try {
      await processGoogleChatMessage(channelId, cfg, {
        text,
        senderId,
        senderName,
        spaceName,
        threadName,
      });
    } catch (err) {
      console.error("[google-chat] processGoogleChatMessage error:", err);
    }
  });
}

async function processGoogleChatMessage(
  channelId: string,
  cfg: GoogleChatChannelConfig,
  opts: { text: string; senderId: string; senderName: string; spaceName: string; threadName: string },
): Promise<void> {
  const { text, senderId, senderName, spaceName, threadName } = opts;

  const orchestrator = await storage.getOrchestratorForChannel(channelId);
  if (!orchestrator) return;

  let agentId = cfg.defaultAgentId;
  if (!agentId) {
    const agents = await storage.listAgents(orchestrator.id);
    if (agents.length > 0) agentId = agents[0].id;
  }
  if (!agentId) return;

  let commsThread = await storage.getCommsThread(channelId, threadName);
  if (!commsThread) {
    commsThread = await storage.createCommsThread({
      channelId,
      externalThreadId: threadName,
      externalChannelId: spaceName,
      externalUserId: senderId,
      externalUserName: senderName,
      agentId,
      platform: "google_chat",
      conversationRef: {
        spaceName,
        threadName,
        webhookUrl: cfg.url ?? "",
      },
      lastActivityAt: new Date(),
    } as any);
  } else {
    await storage.touchCommsThread(commsThread.id);
  }

  const lowerText = text.toLowerCase();
  const bypassApproval = BYPASS_PHRASES.some((p) => lowerText.includes(p));

  const task = await storage.createTask({
    orchestratorId: orchestrator.id,
    agentId,
    channelId,
    commsThreadId: commsThread.id,
    input: text,
    status: "pending",
    priority: 5,
    bypassApproval,
  });

  try {
    if (!TASK_UUID_RE.test(task.id)) throw new Error("Invalid task ID");
    await executeTask(task.id);
  } catch (err) {
    console.error("[google-chat] Task execution error:", err);
  }

  const completedTask = await storage.getTask(task.id);
  const output = completedTask?.output ?? "(no output)";

  if (cfg.url) {
    await postGoogleChatReply(cfg.url, output);
  }
}
