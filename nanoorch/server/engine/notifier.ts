import { storage } from "../storage";
import type { Channel } from "@shared/schema";
import { assertSafeUrl } from "../lib/ssrf-guard";

export type NotificationEvent = "task.completed" | "task.failed" | "task.approval_requested" | "job.fired" | "heartbeat.fired" | "heartbeat.alert";

interface NotificationPayload {
  orchestratorId: string;
  taskId?: string;
  jobId?: string;
  jobName?: string;
  agentId?: string;
  agentName?: string;
  approvalId?: string;
  action?: string;
  message?: string;
  summary?: string;
  error?: string;
}

function formatSlack(event: NotificationEvent, p: NotificationPayload): object {
  const icon = event === "task.completed" ? "✅" : event === "task.failed" ? "❌" : "⏰";
  const title = event === "task.completed" ? "Task Completed" : event === "task.failed" ? "Task Failed" : "Scheduled Job Fired";
  const lines = [`${icon} *${title}*`];
  if (p.agentName) lines.push(`Agent: ${p.agentName}`);
  if (p.taskId) lines.push(`Task ID: \`${p.taskId}\``);
  if (p.jobName) lines.push(`Job: ${p.jobName}`);
  if (p.summary) lines.push(`Output: ${p.summary.slice(0, 200)}`);
  if (p.error) lines.push(`Error: ${p.error.slice(0, 200)}`);
  return { text: lines.join("\n") };
}

function formatTeams(event: NotificationEvent, p: NotificationPayload): object {
  const color = event === "task.completed" ? "00b894" : event === "task.failed" ? "d63031" : "6c5ce7";
  const title = event === "task.completed" ? "Task Completed" : event === "task.failed" ? "Task Failed" : "Scheduled Job Fired";
  const facts: Array<{ name: string; value: string }> = [];
  if (p.agentName) facts.push({ name: "Agent", value: p.agentName });
  if (p.taskId) facts.push({ name: "Task ID", value: p.taskId });
  if (p.jobName) facts.push({ name: "Job", value: p.jobName });
  if (p.summary) facts.push({ name: "Output", value: p.summary.slice(0, 200) });
  if (p.error) facts.push({ name: "Error", value: p.error.slice(0, 200) });
  return {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    themeColor: color,
    summary: title,
    sections: [{ activityTitle: `**NanoOrch — ${title}**`, facts }],
  };
}

function formatGoogleChat(event: NotificationEvent, p: NotificationPayload): object {
  const icon = event === "task.completed" ? "✅" : event === "task.failed" ? "❌" : "⏰";
  const title = event === "task.completed" ? "Task Completed" : event === "task.failed" ? "Task Failed" : "Scheduled Job Fired";
  const lines = [`*${icon} NanoOrch — ${title}*`];
  if (p.agentName) lines.push(`Agent: ${p.agentName}`);
  if (p.taskId) lines.push(`Task: ${p.taskId}`);
  if (p.jobName) lines.push(`Job: ${p.jobName}`);
  if (p.summary) lines.push(`Output: ${p.summary.slice(0, 200)}`);
  if (p.error) lines.push(`Error: ${p.error.slice(0, 200)}`);
  return { text: lines.join("\n") };
}

function formatGeneric(event: NotificationEvent, p: NotificationPayload): object {
  return { event, ...p, timestamp: new Date().toISOString() };
}

function buildBody(ch: Channel, event: NotificationEvent, payload: NotificationPayload): object {
  switch (ch.type) {
    case "slack": return formatSlack(event, payload);
    case "teams": return formatTeams(event, payload);
    case "google_chat": return formatGoogleChat(event, payload);
    default: return formatGeneric(event, payload);
  }
}

async function fireChannel(ch: Channel, event: NotificationEvent, payload: NotificationPayload): Promise<void> {
  const cfg = ch.config as { url?: string; events?: string[]; secret?: string } | null;
  if (!cfg?.url) return;
  try { assertSafeUrl(cfg.url); } catch { return; }
  if (Array.isArray(cfg.events) && cfg.events.length > 0 && !cfg.events.includes(event)) return;

  const body = JSON.stringify(buildBody(ch, event, payload));
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  let statusCode: number | undefined;
  let responseBody: string | undefined;
  let error: string | undefined;

  try {
    const res = await fetch(cfg.url, { method: "POST", headers, body, signal: AbortSignal.timeout(10000) });
    statusCode = res.status;
    responseBody = (await res.text()).slice(0, 500);
  } catch (err: any) {
    error = err?.message ?? String(err);
  }

  try {
    await storage.logChannelDelivery({ channelId: ch.id, event, statusCode, responseBody, error });
  } catch { /* best effort */ }
}

export async function dispatchNotification(orchestratorId: string, event: NotificationEvent, payload: Omit<NotificationPayload, "orchestratorId">): Promise<void> {
  try {
    const channels = await storage.listOutboundChannels(orchestratorId);
    if (channels.length === 0) return;
    await Promise.allSettled(channels.map((ch) => fireChannel(ch, event, { orchestratorId, ...payload })));
  } catch (err) {
    console.error("[notifier] dispatch error:", err);
  }
}

export async function dispatchToChannel(channelId: string, label: string, text: string): Promise<void> {
  try {
    const ch = await storage.getChannel(channelId);
    if (!ch) return;
    const cfg = ch.config as { url?: string } | null;
    if (!cfg?.url) return;
    try { assertSafeUrl(cfg.url); } catch { return; }

    let body: string;
    if (ch.type === "slack") {
      body = JSON.stringify({ text: `*${label}*\n${text}` });
    } else if (ch.type === "teams") {
      body = JSON.stringify({
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        themeColor: "6c5ce7",
        summary: label,
        sections: [{ activityTitle: `**NanoOrch — ${label}**`, activityText: text }],
      });
    } else if (ch.type === "google_chat") {
      body = JSON.stringify({ text: `*${label}*\n${text}` });
    } else {
      body = JSON.stringify({ label, text, timestamp: new Date().toISOString() });
    }

    let statusCode: number | undefined;
    let responseBody: string | undefined;
    let error: string | undefined;

    try {
      const res = await fetch(cfg.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(10000),
      });
      statusCode = res.status;
      responseBody = (await res.text()).slice(0, 500);
    } catch (err: any) {
      error = err?.message ?? String(err);
    }

    try {
      await storage.logChannelDelivery({ channelId: ch.id, event: label, statusCode, responseBody, error });
    } catch { /* best effort */ }
  } catch (err) {
    console.error("[notifier] dispatchToChannel error:", err);
  }
}
