import cron from "node-cron";
import { CronExpressionParser } from "cron-parser";
import { storage } from "../storage";
import type { ScheduledJob } from "@shared/schema";
import { dispatchNotification } from "./notifier";

const registeredJobs = new Map<string, ReturnType<typeof cron.schedule>>();

export function computeNextRun(cronExpression: string, timezone = "UTC"): Date | null {
  try {
    const interval = CronExpressionParser.parse(cronExpression, {
      currentDate: new Date(),
      tz: timezone,
    });
    return interval.next().toDate();
  } catch {
    return null;
  }
}

export function validateCron(cronExpression: string): boolean {
  return cron.validate(cronExpression);
}

async function fireJob(jobId: string) {
  const job = await storage.getScheduledJob(jobId);
  if (!job || !job.isActive) return;

  try {
    const orchestrator = await storage.getOrchestrator(job.orchestratorId);
    if (!orchestrator || orchestrator.status === "paused") {
      console.log(`[scheduler] Skipping job "${job.name}" — orchestrator is paused`);
      return;
    }

    const task = await storage.createTask({
      orchestratorId: job.orchestratorId,
      agentId: job.agentId,
      input: job.prompt,
      status: "pending",
      intent: (job.intent as "action" | "code_execution" | "conversational") ?? "conversational",
      bypassApproval: job.bypassApproval ?? false,
      priority: 5,
      notifyChannelId: (job as any).notifyChannelId ?? undefined,
    });

    const nextRunAt = computeNextRun(job.cronExpression, job.timezone ?? "UTC");

    await storage.updateScheduledJob(jobId, {
      lastRunAt: new Date(),
      lastTaskId: task.id,
      ...(nextRunAt ? { nextRunAt } : {}),
    });

    console.log(`[scheduler] Fired job "${job.name}" → task ${task.id}`);
    dispatchNotification(job.orchestratorId, "job.fired", {
      taskId: task.id,
      jobId: job.id,
      jobName: job.name,
    }).catch(console.error);
  } catch (err) {
    console.error(`[scheduler] Error firing job "${job.name}":`, err); // nosemgrep: javascript.lang.security.audit.unsafe-formatstring -- console.error has no format-string interpretation; job.name is an operator-defined scheduler name
  }
}

export function registerJob(job: ScheduledJob) {
  if (registeredJobs.has(job.id)) {
    registeredJobs.get(job.id)!.stop();
    registeredJobs.delete(job.id);
  }

  if (!job.isActive) return;

  if (!cron.validate(job.cronExpression)) {
    console.warn(`[scheduler] Invalid cron expression for job "${job.name}": ${job.cronExpression}`);
    return;
  }

  const task = cron.schedule(
    job.cronExpression,
    () => { fireJob(job.id).catch(console.error); },
    { timezone: job.timezone ?? "UTC" }
  );

  registeredJobs.set(job.id, task);
}

export function unregisterJob(jobId: string) {
  const task = registeredJobs.get(jobId);
  if (task) {
    task.stop();
    registeredJobs.delete(jobId);
  }
}

export async function startScheduler() {
  try {
    const jobs = await storage.listAllActiveScheduledJobs();
    for (const job of jobs) {
      registerJob(job);
    }
    console.log(`[scheduler] Started with ${jobs.length} active job(s)`);
  } catch (err) {
    console.error("[scheduler] Failed to start:", err);
  }
}
