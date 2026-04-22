import { storage } from "../storage";
import { executeTask } from "./executor";

let isRunning = false;

// Maps taskId → orchestratorId for all currently-executing tasks.
// Using a Map (not a Set) lets us count per-orchestrator concurrency
// correctly — previously a Set<taskId> was filtered with startsWith(orchestratorId)
// which always returned 0 because task UUIDs never start with the orchestrator UUID.
const runningTasks = new Map<string, string>();

export function startQueueWorker() {
  if (isRunning) return;
  isRunning = true;
  processQueue();
}

async function processQueue() {
  while (true) {
    try {
      const pendingTasks = await storage.listPendingTasks();

      for (const task of pendingTasks) {
        if (runningTasks.has(task.id)) continue;

        const orchestrator = await storage.getOrchestrator(task.orchestratorId);
        if (!orchestrator || orchestrator.status === "paused") continue;

        const maxConcurrent = orchestrator.maxConcurrency ?? 3;
        const runningForOrchestrator = Array.from(runningTasks.values())
          .filter((oid) => oid === orchestrator.id).length;
        if (runningForOrchestrator >= maxConcurrent) continue;

        runningTasks.set(task.id, orchestrator.id);
        executeTask(task.id)
          .catch((err) => console.error(`Queue: task ${task.id} failed:`, err))
          .finally(() => runningTasks.delete(task.id));
      }
    } catch (err) {
      console.error("Queue worker error:", err);
    }

    await sleep(2000);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
