import { storage } from "../storage";
import { executeTask } from "./executor";
import { dispatchToChannel } from "./notifier";

export async function executePipeline(pipelineRunId: string): Promise<void> {
  const run = await storage.getPipelineRun(pipelineRunId);
  if (!run) throw new Error(`Pipeline run ${pipelineRunId} not found`);

  const pipeline = await storage.getPipeline(run.pipelineId);
  if (!pipeline) throw new Error(`Pipeline ${run.pipelineId} not found`);

  const steps = await storage.listPipelineSteps(pipeline.id);
  if (steps.length === 0) {
    await storage.updatePipelineRun(pipelineRunId, {
      status: "completed",
      startedAt: new Date(),
      completedAt: new Date(),
    });
    return;
  }

  await storage.updatePipelineRun(pipelineRunId, { status: "running", startedAt: new Date() });

  const sortedSteps = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);
  const stepOutputs: Record<string, string> = {};

  try {
    for (const step of sortedSteps) {
      const stepRun = await storage.createPipelineStepRun({
        runId: pipelineRunId,
        stepId: step.id,
        status: "running",
        startedAt: new Date(),
      });

      let prompt = step.promptTemplate;

      const previousOutputParts = sortedSteps
        .filter((s) => s.stepOrder < step.stepOrder && stepOutputs[s.id])
        .map((s) => `[${s.name} output]:\n${stepOutputs[s.id]}`);

      if (previousOutputParts.length > 0) {
        prompt = `Previous step outputs:\n\n${previousOutputParts.join("\n\n")}\n\n---\n\nYour task:\n${prompt}`;
      }

      const orchestrator = await storage.getOrchestrator(pipeline.orchestratorId);
      if (!orchestrator) throw new Error(`Orchestrator ${pipeline.orchestratorId} not found`);

      const task = await storage.createTask({
        orchestratorId: pipeline.orchestratorId,
        agentId: step.agentId,
        input: prompt,
        status: "pending",
        intent: "conversational",
        priority: 5,
      });

      await storage.updatePipelineStepRun(stepRun.id, { taskId: task.id });

      await executeTask(task.id);

      const completedTask = await storage.getTask(task.id);
      if (!completedTask || completedTask.status === "failed") {
        const errMsg = completedTask?.errorMessage ?? "Step task failed";
        await storage.updatePipelineStepRun(stepRun.id, {
          status: "failed",
          error: errMsg,
          completedAt: new Date(),
        });
        throw new Error(`Step "${step.name}" failed: ${errMsg}`);
      }

      const stepOutput = completedTask.output ?? "";
      stepOutputs[step.id] = stepOutput;

      await storage.updatePipelineStepRun(stepRun.id, {
        status: "completed",
        output: stepOutput,
        completedAt: new Date(),
      });
    }

    await storage.updatePipelineRun(pipelineRunId, {
      status: "completed",
      completedAt: new Date(),
    });
    await storage.updatePipeline(pipeline.id, { lastRunAt: new Date() }).catch(console.error);

    if ((pipeline as any).notifyChannelId) {
      dispatchToChannel(
        (pipeline as any).notifyChannelId,
        `✅ Pipeline Completed — ${pipeline.name}`,
        `Pipeline "${pipeline.name}" finished successfully.`,
      ).catch(console.error);
    }
  } catch (err: any) {
    await storage.updatePipelineRun(pipelineRunId, {
      status: "failed",
      error: err.message,
      completedAt: new Date(),
    });

    if ((pipeline as any).notifyChannelId) {
      dispatchToChannel(
        (pipeline as any).notifyChannelId,
        `❌ Pipeline Failed — ${pipeline.name}`,
        `Pipeline "${pipeline.name}" failed: ${err.message}`,
      ).catch(console.error);
    }
  }
}
