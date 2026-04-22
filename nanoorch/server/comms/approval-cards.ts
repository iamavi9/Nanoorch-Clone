import type { CommsThread } from "@shared/schema";

export interface ApprovalCardData {
  approvalId: string;
  action: string;
  message: string;
  impact?: string | null;
}

export function buildSlackApprovalBlocks(data: ApprovalCardData): object[] {
  const fields = [
    { type: "mrkdwn", text: `*Action:*\n${data.action}` },
    { type: "mrkdwn", text: `*Requested by Agent*` },
  ];
  if (data.impact) {
    fields.push({ type: "mrkdwn", text: `*Impact:*\n${data.impact}` });
  }

  return [
    {
      type: "header",
      text: { type: "plain_text", text: "⚠️ Approval Required", emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${data.message}*` },
    },
    {
      type: "section",
      fields,
    },
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "✅ Approve", emoji: true },
          style: "primary",
          value: data.approvalId,
          action_id: "approval_approve",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "❌ Reject", emoji: true },
          style: "danger",
          value: data.approvalId,
          action_id: "approval_reject",
        },
      ],
    },
  ];
}

export function buildTeamsApprovalCard(data: ApprovalCardData): object {
  const body: object[] = [
    {
      type: "TextBlock",
      text: "⚠️ Approval Required",
      weight: "Bolder",
      size: "Medium",
      color: "Warning",
    },
    {
      type: "TextBlock",
      text: data.message,
      wrap: true,
    },
    {
      type: "FactSet",
      facts: [
        { title: "Action", value: data.action },
        ...(data.impact ? [{ title: "Impact", value: data.impact }] : []),
      ],
    },
  ];

  return {
    type: "AdaptiveCard",
    version: "1.4",
    body,
    actions: [
      {
        type: "Action.Submit",
        title: "✅ Approve",
        data: { approvalId: data.approvalId, resolution: "approved" },
        style: "positive",
      },
      {
        type: "Action.Submit",
        title: "❌ Reject",
        data: { approvalId: data.approvalId, resolution: "rejected" },
        style: "destructive",
      },
    ],
  };
}

export async function postSlackApprovalCard(
  botToken: string,
  channel: string,
  threadTs: string,
  data: ApprovalCardData,
): Promise<void> {
  const blocks = buildSlackApprovalBlocks(data);
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      channel,
      thread_ts: threadTs,
      text: `Approval required: ${data.action}`,
      blocks,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json() as any;
  if (!json.ok) {
    console.error("[approval-cards] Slack postMessage failed:", json.error);
  }
}

export async function postTeamsApprovalCard(
  serviceUrl: string,
  conversationId: string,
  activityId: string,
  appId: string,
  appPassword: string,
  data: ApprovalCardData,
): Promise<void> {
  const { replyToTeams } = await import("./teams-handler");
  const card = buildTeamsApprovalCard(data);
  const cardJson = JSON.stringify(card);

  const tokenRes = await fetch(
    "https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token",
    {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: appId,
        client_secret: appPassword,
        scope: "https://api.botframework.com/.default",
      }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    },
  );
  if (!tokenRes.ok) {
    await replyToTeams(serviceUrl, conversationId, activityId, `Approval required: ${data.message}`, appId, appPassword);
    return;
  }
  const tokenData = await tokenRes.json() as any;
  const token = tokenData.access_token;

  const url = `${serviceUrl.replace(/\/$/, "")}/v3/conversations/${conversationId}/activities/${activityId}`;
  await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: JSON.parse(cardJson),
        },
      ],
    }),
    signal: AbortSignal.timeout(15_000),
  });
}

export async function dispatchApprovalCard(
  thread: CommsThread,
  data: ApprovalCardData,
): Promise<void> {
  try {
    const ref = (thread.conversationRef || {}) as Record<string, string>;
    if (thread.platform === "slack") {
      const { botToken, channel, thread_ts } = ref;
      if (!botToken || !channel || !thread_ts) return;
      await postSlackApprovalCard(botToken, channel, thread_ts, data);
    } else if (thread.platform === "teams") {
      const { serviceUrl, conversationId, activityId, appId, appPassword } = ref;
      if (!serviceUrl || !conversationId || !activityId || !appId || !appPassword) return;
      await postTeamsApprovalCard(serviceUrl, conversationId, activityId, appId, appPassword, data);
    }
  } catch (err) {
    console.error("[approval-cards] Failed to dispatch approval card:", err);
  }
}
