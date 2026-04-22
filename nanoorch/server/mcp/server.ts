import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { storage } from "../storage";
import { executeTask } from "../engine/executor";

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}

function json(data: unknown) {
  return text(JSON.stringify(data, null, 2));
}

export function createMcpServer(workspaceId: string): McpServer {
  const server = new McpServer({
    name: "NanoOrch",
    version: "1.0.0",
  });

  // ── list_orchestrators ──────────────────────────────────────────────────────
  server.tool(
    "list_orchestrators",
    "List all orchestrators in the workspace, including their status, provider, and model.",
    {},
    async () => {
      const orchs = await storage.listOrchestrators(workspaceId);
      if (orchs.length === 0) return text("No orchestrators found in this workspace.");
      return json(orchs.map(o => ({
        id: o.id,
        name: o.name,
        status: o.status,
        provider: o.provider,
        model: o.model,
      })));
    },
  );

  // ── list_agents ─────────────────────────────────────────────────────────────
  server.tool(
    "list_agents",
    "List all agents in the workspace with their orchestrator, provider, and model.",
    {},
    async () => {
      const agents = await storage.listAgentsForWorkspace(workspaceId);
      if (agents.length === 0) return text("No agents found in this workspace.");
      return json(agents.map(a => ({
        id: a.id,
        name: a.name,
        orchestratorId: a.orchestratorId,
        orchestratorName: a.orchestratorName,
        provider: a.provider,
        model: a.model,
      })));
    },
  );

  // ── run_task ────────────────────────────────────────────────────────────────
  server.tool(
    "run_task",
    "Submit a task to an agent and wait for the result. Returns the task output.",
    {
      orchestratorId: z.string().describe("ID of the orchestrator to run the task on"),
      agentId: z.string().describe("ID of the agent to use. Use list_agents to find agent IDs."),
      input: z.string().describe("The task prompt / user message to send to the agent"),
    },
    async ({ orchestratorId, agentId, input }) => {
      const orch = await storage.getOrchestrator(orchestratorId);
      if (!orch) return text(`Orchestrator not found: ${orchestratorId}`);
      if (orch.workspaceId !== workspaceId) return text("Orchestrator does not belong to this workspace.");

      const agent = await storage.getAgent(agentId);
      if (!agent) return text(`Agent not found: ${agentId}`);

      const task = await storage.createTask({
        orchestratorId,
        agentId,
        input,
        status: "pending",
        bypassApproval: false,
      });

      try {
        await executeTask(task.id);
        const updated = await storage.getTask(task.id);
        return json({
          taskId: updated?.id,
          status: updated?.status,
          output: updated?.output ?? null,
          error: updated?.errorMessage ?? null,
        });
      } catch (err: any) {
        return text(`Task failed: ${err.message}`);
      }
    },
  );

  // ── get_task_status ─────────────────────────────────────────────────────────
  server.tool(
    "get_task_status",
    "Get the current status, output, and logs for a task by its ID.",
    {
      taskId: z.string().describe("The task ID returned from run_task or visible in the NanoOrch UI"),
    },
    async ({ taskId }) => {
      const task = await storage.getTask(taskId);
      if (!task) return text(`Task not found: ${taskId}`);

      const orch = await storage.getOrchestrator(task.orchestratorId);
      if (orch?.workspaceId !== workspaceId) return text("Task does not belong to this workspace.");

      const logs = await storage.listTaskLogs(taskId);
      return json({
        id: task.id,
        status: task.status,
        input: task.input,
        output: task.output ?? null,
        error: task.errorMessage ?? null,
        createdAt: task.createdAt,
        completedAt: task.completedAt ?? null,
        logCount: logs.length,
        recentLogs: logs.slice(-5).map(l => ({ level: l.level, message: l.message })),
      });
    },
  );

  // ── list_pending_approvals ──────────────────────────────────────────────────
  server.tool(
    "list_pending_approvals",
    "List all pending approval requests in the workspace that require human review.",
    {},
    async () => {
      const result = await storage.listApprovalRequests(workspaceId, "pending", 20, 0);
      if (!result.length) return text("No pending approvals.");
      return json(result.map(a => ({
        id: a.id,
        agentName: a.agentName,
        message: a.message,
        action: a.action,
        impact: a.impact,
        taskId: a.taskId,
        createdAt: a.createdAt,
      })));
    },
  );

  // ── approve_request ─────────────────────────────────────────────────────────
  server.tool(
    "approve_request",
    "Approve or reject a pending approval request. Use list_pending_approvals to find approval IDs.",
    {
      approvalId: z.string().describe("ID of the approval request to resolve"),
      decision: z.enum(["approved", "rejected"]).describe("Whether to approve or reject the request"),
      resolution: z.string().optional().describe("Optional note explaining the decision"),
    },
    async ({ approvalId, decision, resolution }) => {
      const approval = await storage.getApprovalRequest(approvalId);
      if (!approval) return text(`Approval request not found: ${approvalId}`);
      if (approval.workspaceId !== workspaceId) return text("Approval does not belong to this workspace.");
      if (approval.status !== "pending") return text(`Approval is already ${approval.status}.`);

      await storage.resolveApprovalRequest(
        approvalId,
        "mcp-tool",
        resolution ?? decision,
        decision,
      );

      return text(`Approval ${approvalId} has been ${decision}.`);
    },
  );

  // ── trigger_pipeline ────────────────────────────────────────────────────────
  server.tool(
    "trigger_pipeline",
    "Manually trigger a pipeline run. Use list_orchestrators to find an orchestrator, then look up pipelines for it.",
    {
      pipelineId: z.string().describe("ID of the pipeline to trigger"),
    },
    async ({ pipelineId }) => {
      const pipeline = await storage.getPipeline(pipelineId);
      if (!pipeline) return text(`Pipeline not found: ${pipelineId}`);

      const orch = await storage.getOrchestrator(pipeline.orchestratorId);
      if (orch?.workspaceId !== workspaceId) return text("Pipeline does not belong to this workspace.");

      const run = await storage.createPipelineRun({
        pipelineId,
        status: "pending",
        triggeredBy: "mcp",
      });

      const { executePipeline } = await import("../engine/pipeline-executor");
      executePipeline(run.id).catch(console.error);

      return json({ pipelineRunId: run.id, status: run.status, pipelineName: pipeline.name });
    },
  );

  // ── fire_scheduled_job ──────────────────────────────────────────────────────
  server.tool(
    "fire_scheduled_job",
    "Immediately fire a scheduled job, bypassing its cron schedule.",
    {
      jobId: z.string().describe("ID of the scheduled job to fire"),
    },
    async ({ jobId }) => {
      const job = await storage.getScheduledJob(jobId);
      if (!job) return text(`Scheduled job not found: ${jobId}`);
      if (job.workspaceId !== workspaceId) return text("Scheduled job does not belong to this workspace.");

      const orch = await storage.getOrchestrator(job.orchestratorId);
      if (!orch) return text("Orchestrator for scheduled job not found.");

      const task = await storage.createTask({
        orchestratorId: job.orchestratorId,
        agentId: job.agentId,
        input: job.prompt,
        status: "pending",
        bypassApproval: false,
      });

      await storage.updateScheduledJob(jobId, { lastRunAt: new Date(), lastTaskId: task.id });

      return json({ taskId: task.id, jobName: job.name, status: "queued" });
    },
  );

  return server;
}
