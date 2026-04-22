import { storage } from "../storage";

async function postSlackMessage(
  botToken: string,
  channel: string,
  threadTs: string,
  text: string,
): Promise<string | null> {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel, thread_ts: threadTs, text }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json() as any;
  if (!data.ok) {
    console.error("[comms-reply] Slack postMessage failed:", data.error);
    return null;
  }
  return data.ts as string;
}

async function updateSlackMessage(
  botToken: string,
  channel: string,
  ts: string,
  text: string,
): Promise<void> {
  const res = await fetch("https://slack.com/api/chat.update", {
    method: "POST",
    headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel, ts, text }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json() as any;
  if (!data.ok) {
    console.error("[comms-reply] Slack chat.update failed:", data.error);
  }
}

async function replyToTeams(
  serviceUrl: string,
  conversationId: string,
  activityId: string,
  appId: string,
  appPassword: string,
  text: string,
): Promise<void> {
  const { replyToTeams: _reply } = await import("./teams-handler");
  await _reply(serviceUrl, conversationId, activityId, text, appId, appPassword);
}

async function postGoogleChatWebhook(webhookUrl: string, text: string): Promise<void> {
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(15_000),
  });
}

export async function dispatchCommsReply(commsThreadId: string, text: string): Promise<void> {
  try {
    const thread = await storage.getCommsThreadById(commsThreadId);
    if (!thread) return;

    const ref = (thread.conversationRef || {}) as Record<string, string>;

    if (thread.platform === "slack") {
      const botToken = ref.botToken;
      const slackChannel = ref.channel;
      const threadTs = ref.thread_ts;
      const typingTs = ref.typing_ts;
      if (!botToken || !slackChannel || !threadTs) return;

      if (typingTs) {
        await updateSlackMessage(botToken, slackChannel, typingTs, text);
        const updatedRef: Record<string, unknown> = { ...ref };
        delete (updatedRef as any).typing_ts;
        await storage.updateCommsThreadRef(thread.id, updatedRef);
      } else {
        await postSlackMessage(botToken, slackChannel, threadTs, text);
      }
    } else if (thread.platform === "teams") {
      const { serviceUrl, conversationId, activityId, appId, appPassword } = ref;
      if (!serviceUrl || !conversationId || !activityId || !appId || !appPassword) return;
      await replyToTeams(serviceUrl, conversationId, activityId, appId, appPassword, text);
    } else if (thread.platform === "google_chat") {
      const webhookUrl = ref.webhookUrl;
      if (!webhookUrl) return;
      await postGoogleChatWebhook(webhookUrl, text);
    }
  } catch (err) {
    console.error("[comms-reply] Failed to dispatch reply:", err);
  }
}
