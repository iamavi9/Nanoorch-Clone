import cron from "node-cron";
import { storage } from "../storage";
import type { Agent } from "@shared/schema";
import { dispatchNotification } from "./notifier";

const heartbeatJobs = new Map<string, ReturnType<typeof cron.schedule>>();

function minutesToCron(minutes: number): string {
  if (minutes <= 0) return "";
  if (minutes < 60) return `*/${minutes} * * * *`;

  // For hour-aligned intervals use the clean form
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `0 */${hours} * * *`;
  }

  // Non-hour-aligned intervals (e.g. 90 min) cannot be expressed precisely in
  // standard 5-field cron.  Round to the nearest whole hour and warn so
  // operators know to use clean multiples (30, 60, 120, 240 …).
  const rounded = Math.max(1, Math.round(minutes / 60));
  console.warn(
    `[heartbeat] Interval ${minutes}m is not a clean multiple of 60 — ` +
    `rounding to ${rounded}h. Use 30, 60, 120, 180 … minute intervals for exact scheduling.`
  );
  return `0 */${rounded} * * *`;
}

async function fireHeartbeat(agentId: string): Promise<string | null> {
  const agent = await storage.getAgent(agentId);
  if (!agent || !agent.heartbeatEnabled) return null;

  const orchestrator = await storage.getOrchestrator(agent.orchestratorId);
  if (!orchestrator || orchestrator.status === "paused") {
    console.log(`[heartbeat] Skipping agent "${agent.name}" — orchestrator is paused`);
    return null;
  }

  const silencePhrase = agent.heartbeatSilencePhrase ?? "HEARTBEAT_OK";
  const checklist = agent.heartbeatChecklist ?? "";

  const heartbeatInput = [
    `[HEARTBEAT TASK — ${new Date().toISOString()}]`,
    checklist
      ? `Follow this checklist strictly. Do not infer or repeat old tasks from prior chats:\n\n${checklist}`
      : "Perform a general status check. Report only if something needs attention.",
    `If nothing needs attention, reply with exactly: ${silencePhrase}`,
  ].join("\n\n");

  const task = await storage.createTask({
    orchestratorId: agent.orchestratorId,
    agentId: agent.id,
    input: heartbeatInput,
    status: "pending",
    intent: "conversational",
    priority: 3,
    isHeartbeat: true,
    notifyChannelId: (agent as any).heartbeatNotifyChannelId ?? undefined,
  });

  await storage.updateAgentHeartbeatLastFired(agent.id);

  console.log(`[heartbeat] Fired for agent "${agent.name}" → task ${task.id}`);

  dispatchNotification(orchestrator.id, "heartbeat.fired", {
    agentId: agent.id,
    agentName: agent.name,
    taskId: task.id,
  }).catch(console.error);

  return task.id;
}

export function registerHeartbeatJob(agent: Agent) {
  unregisterHeartbeatJob(agent.id);

  if (!agent.heartbeatEnabled) return;

  const intervalMinutes = agent.heartbeatIntervalMinutes ?? 30;
  const cronExpr = minutesToCron(intervalMinutes);

  if (!cronExpr || !cron.validate(cronExpr)) {
    console.warn(`[heartbeat] Invalid interval for agent "${agent.name}": ${intervalMinutes}m`);
    return;
  }

  const task = cron.schedule(cronExpr, () => {
    fireHeartbeat(agent.id).catch(console.error);
  });

  heartbeatJobs.set(agent.id, task);
  console.log(`[heartbeat] Registered agent "${agent.name}" — every ${intervalMinutes}m (${cronExpr})`);
}

export function unregisterHeartbeatJob(agentId: string) {
  const task = heartbeatJobs.get(agentId);
  if (task) {
    task.stop();
    heartbeatJobs.delete(agentId);
  }
}

export async function fireHeartbeatNow(agentId: string): Promise<string> {
  const agent = await storage.getAgent(agentId);
  if (!agent) throw new Error("Agent not found");
  if (!agent.heartbeatEnabled) throw new Error("Heartbeat is not enabled for this agent");

  const taskId = await fireHeartbeat(agentId);
  if (!taskId) {
    // fireHeartbeat returns null when the orchestrator is paused — surface
    // that clearly instead of returning an empty string the caller can't act on.
    const orchestrator = await storage.getOrchestrator(agent.orchestratorId);
    const reason = orchestrator?.status === "paused"
      ? "Orchestrator is paused — unpause it before firing a heartbeat"
      : "Heartbeat could not be fired (agent may be disabled)";
    throw new Error(reason);
  }
  return taskId;
}

export async function startHeartbeats() {
  try {
    const agentsWithHeartbeat = await storage.listAgentsWithHeartbeat();
    for (const agent of agentsWithHeartbeat) {
      registerHeartbeatJob(agent);
    }
    console.log(`[heartbeat] Started with ${agentsWithHeartbeat.length} active heartbeat(s)`);
  } catch (err) {
    console.error("[heartbeat] Failed to start:", err);
  }
}
