import { storage } from "../storage";
import { runAgent } from "../providers";
import type { Provider, ProviderMessage, ToolDefinition } from "../providers";
import type { Orchestrator, Agent } from "@shared/schema";
import { taskLogEmitter } from "./emitter";
import { decrypt } from "../lib/encryption";
import { executeCloudTool, type CloudCredentials } from "../cloud/executor";
import { getToolsForProvider, detectProviderFromToolName, CODE_INTERPRETER_TOOL, REQUEST_APPROVAL_TOOL, SPAWN_AGENT_TOOL } from "../cloud/tools";
import { sanitizeToolArgs } from "../lib/mountAllowlist";
import { isDockerAvailable, executeTaskInDocker } from "./docker-executor";
import { isK3sAvailable, executeTaskInK3s } from "./k3s-executor";
import { runCode } from "./sandbox-executor";
import { dispatchNotification, dispatchToChannel } from "./notifier";
import { dispatchCommsReply } from "../comms/comms-reply";
import { dispatchApprovalCard } from "../comms/approval-cards";
import { generateEmbedding } from "../lib/embeddings";
import { estimateTokenCost } from "./token-cost";

async function runAgentWithFailover(
  orchestrator: Orchestrator,
  options: Omit<Parameters<typeof runAgent>[0], "provider" | "model" | "baseUrl" | "apiKey">,
  log: (level: "info" | "warn" | "error", msg: string) => Promise<void>,
): Promise<Awaited<ReturnType<typeof runAgent>>> {
  let primaryApiKey: string | null = null;
  if (orchestrator.provider === "vllm" && (orchestrator as any).vllmApiKey) {
    try {
      const { decrypt } = await import("../lib/encryption");
      primaryApiKey = decrypt((orchestrator as any).vllmApiKey);
    } catch {
      // If decryption fails (key changed), proceed without API key
    }
  }

  try {
    return await runAgent({
      provider: orchestrator.provider,
      model: orchestrator.model,
      baseUrl: orchestrator.baseUrl,
      apiKey: primaryApiKey,
      ...options,
    });
  } catch (primaryErr: any) {
    const fp = (orchestrator as any).failoverProvider as Provider | undefined;
    const fm = (orchestrator as any).failoverModel as string | undefined;
    if (!fp || !fm) throw primaryErr;

    await log("warn", `Primary provider ${orchestrator.provider}/${orchestrator.model} failed: ${primaryErr.message} — failing over to ${fp}/${fm}`);
    return runAgent({
      provider: fp,
      model: fm,
      ...options,
    });
  }
}

const MAX_TOOL_ROUNDS = 10;

export async function executeTask(taskId: string): Promise<void> {
  const task = await storage.getTask(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  const needsSandbox = task.intent === "action" || (task.intent?.startsWith("git-agent:") ?? false);
  if (isK3sAvailable() && needsSandbox) {
    return executeTaskInK3s(taskId);
  }
  if (isDockerAvailable() && needsSandbox) {
    return executeTaskInDocker(taskId);
  }

  const orchestrator = await storage.getOrchestrator(task.orchestratorId);
  if (!orchestrator) throw new Error(`Orchestrator not found`);

  const agent = task.agentId ? await storage.getAgent(task.agentId) : null;
  const allAgents = await storage.listAgents(task.orchestratorId);

  await storage.updateTask(taskId, { status: "running", startedAt: new Date() });

  const log = async (level: "info" | "warn" | "error", message: string, metadata?: Record<string, unknown>) => {
    const entry = await storage.createTaskLog({ taskId, level, message, metadata });
    taskLogEmitter.emit(`task:${taskId}`, { ...entry, timestamp: entry.timestamp ?? new Date() });
  };

  const commsThread = task.commsThreadId
    ? await storage.getCommsThreadById(task.commsThreadId)
    : null;

  try {
    await log("info", `Task started — provider: ${orchestrator.provider}, model: ${orchestrator.model}`);

    const cloudCreds = await loadCloudCredentials(orchestrator.workspaceId, log);
    const availableTools = buildToolList(cloudCreds, task.intent === "code_execution", allAgents);

    if (cloudCreds.length > 0) {
      await log("info", `Cloud integrations active: ${cloudCreds.map((c) => c.provider).join(", ")} (${availableTools.length} tools available)`);
    }
    if (allAgents.length > 1) {
      await log("info", `Multi-agent delegation available: ${allAgents.length} agents in orchestrator`);
    }

    const messages: ProviderMessage[] = [];

    if (commsThread) {
      const history = (commsThread.history as Array<{ role: string; content: string }>) ?? [];
      if (history.length > 0) {
        for (const entry of history) {
          messages.push({ role: entry.role as "user" | "assistant" | "system", content: entry.content });
        }
        await log("info", `Loaded ${history.length} messages from thread history`);
      }
    }

    if (agent?.memoryEnabled) {
      const memory = await storage.listAgentMemory(agent.id);
      if (memory.length > 0) {
        const memStr = memory.map((m) => `${m.key}: ${m.value}`).join("\n");
        messages.push({ role: "system", content: `Agent memory:\n${memStr}` });
      }
      try {
        const queryEmb = await generateEmbedding(task.input);
        if (queryEmb) {
          const vecMems = await storage.retrieveVectorMemories(agent.id, orchestrator.workspaceId, queryEmb, 5);
          const relevant = vecMems.filter((m) => m.similarity >= 0.70);
          if (relevant.length > 0) {
            const memStr = relevant.map((m, i) => `${i + 1}. [${m.source}] ${m.content}`).join("\n\n");
            messages.push({ role: "system", content: `Relevant memories from past tasks:\n${memStr}` });
            await log("info", `Vector memory: ${relevant.length} relevant entr${relevant.length === 1 ? "y" : "ies"} injected`);
          }
        }
      } catch {
      }
    }

    messages.push({ role: "user", content: task.input });

    const systemPrompt = buildSystemPrompt(orchestrator, agent, availableTools.length > 0, allAgents);

    await log("info", `Running agent${agent ? ` "${agent.name}"` : ""} with ${messages.length} message(s)`);

    let output = "";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let approvalRequested = false;

    if (availableTools.length === 0) {
      const result = await runAgentWithFailover(orchestrator, {
        systemPrompt,
        messages,
        maxTokens: agent?.maxTokens ?? 4096,
        temperature: agent?.temperature ?? 70,
        onChunk: (chunk) => {
          taskLogEmitter.emit(`task:${taskId}:stream`, chunk);
        },
      }, log);
      output = result.content;
      if (result.usage) {
        totalInputTokens += result.usage.inputTokens;
        totalOutputTokens += result.usage.outputTokens;
      }
    } else {
      let toolRounds = 0;
      let done = false;

      while (!done && toolRounds < MAX_TOOL_ROUNDS) {
        const result = await runAgentWithFailover(orchestrator, {
          systemPrompt,
          messages,
          maxTokens: agent?.maxTokens ?? 4096,
          temperature: agent?.temperature ?? 70,
          tools: availableTools,
        }, log);

        if (result.usage) {
          totalInputTokens += result.usage.inputTokens;
          totalOutputTokens += result.usage.outputTokens;
        }

        if (!result.toolCalls || result.toolCalls.length === 0) {
          output = result.content;
          taskLogEmitter.emit(`task:${taskId}:stream`, output);
          done = true;
          break;
        }

        if (result.content) {
          messages.push({ role: "assistant", content: result.content });
        }

        const pendingSpawnCalls: typeof result.toolCalls = [];

        for (const toolCall of result.toolCalls) {
          if (toolCall.name === "spawn_agent") {
            pendingSpawnCalls.push(toolCall);
            continue;
          }

          if (toolCall.name === "request_approval") {
            const { message, action, impact } = toolCall.arguments as { message: string; action: string; impact?: string };

            if ((task as any).bypassApproval) {
              await log("info", `Approval gate bypassed (bypass_approval=true): ${action}`);
              messages.push({
                role: "user",
                content: `Tool request_approval result: {"status":"bypassed","message":"Approval has been bypassed by the user. You may proceed with the action."}`,
              });
              continue;
            }

            await log("warn", `Approval gate triggered: ${action}`, { message, action, impact });
            const approvalReq = await storage.createApprovalRequest({
              workspaceId: orchestrator.workspaceId,
              taskId,
              agentId: agent?.id ?? null,
              agentName: agent?.name ?? "Agent",
              message,
              action,
              impact: impact ?? null,
              status: "pending",
            });
            messages.push({
              role: "user",
              content: `Tool request_approval result: {"status":"pending","approvalId":"${approvalReq.id}","message":"Approval request created. A human must review and approve or reject this before you proceed."}`,
            });
            approvalRequested = true;
            dispatchNotification(orchestrator.id, "task.approval_requested", {
              taskId, agentName: agent?.name, approvalId: approvalReq.id, action, message,
            }).catch(console.error);

            if (commsThread) {
              dispatchApprovalCard(commsThread, {
                approvalId: approvalReq.id,
                action,
                message,
                impact: impact ?? null,
              }).catch(console.error);
            }
            continue;
          }

          if (toolCall.name === "code_interpreter") {
            const { language, code } = toolCall.arguments as { language: string; code: string };
            const sandboxTimeout = agent?.sandboxTimeoutSeconds ?? undefined;
            await log("info", `Running ${language} code${sandboxTimeout ? ` (timeout: ${sandboxTimeout}s)` : ""}`);
            try {
              const sandboxResult = await runCode(language, code, sandboxTimeout);
              const codeOutput = sandboxResult.exitCode === 0
                ? `exit_code: 0\nstdout:\n${sandboxResult.stdout || "(no output)"}`
                : `exit_code: ${sandboxResult.exitCode}\nstdout:\n${sandboxResult.stdout || "(no output)"}\nstderr:\n${sandboxResult.stderr || "(none)"}`;
              await log("info", `Code execution completed (exit ${sandboxResult.exitCode})`);
              messages.push({ role: "user", content: `Tool code_interpreter result:\n${codeOutput}` });
            } catch (err: any) {
              await log("error", `Code execution failed: ${err.message}`);
              messages.push({ role: "user", content: `Tool code_interpreter result: ERROR — ${err?.message ?? String(err)}` });
            }
            continue;
          }

          const cloudProvider = detectProviderFromToolName(toolCall.name);
          const safeArgs = sanitizeToolArgs(toolCall.arguments);
          await log("info", `Calling tool: ${toolCall.name}`, { args: safeArgs });

          const matchedCred = cloudCreds.find((c) => c.provider === cloudProvider);
          if (!matchedCred) {
            const errMsg = `No active ${cloudProvider} integration found for this workspace`;
            await log("warn", errMsg);
            messages.push({ role: "user", content: `Tool ${toolCall.name} result: ERROR — ${errMsg}` });
            continue;
          }

          try {
            const toolResult = await executeCloudTool(toolCall.name, toolCall.arguments, matchedCred);
            await storage.touchCloudIntegration(matchedCred.integrationId);
            const resultStr = JSON.stringify(toolResult, null, 2);
            await log("info", `Tool ${toolCall.name} completed`, { resultLength: resultStr.length });
            messages.push({ role: "user", content: `Tool ${toolCall.name} result:\n${resultStr}` });
          } catch (toolErr: any) {
            const errMsg = toolErr?.message ?? String(toolErr);
            await log("error", `Tool ${toolCall.name} failed: ${errMsg}`);
            messages.push({ role: "user", content: `Tool ${toolCall.name} result: ERROR — ${errMsg}` });
          }
        }

        if (pendingSpawnCalls.length > 0) {
          await log("info", `Spawning ${pendingSpawnCalls.length} sub-agent(s) in parallel…`);

          const spawnResults = await Promise.allSettled(
            pendingSpawnCalls.map(async (tc) => {
              const { agentId, agentName, prompt } = tc.arguments as { agentId: string; agentName?: string; prompt: string };

              const targetAgent = allAgents.find((a) => a.id === agentId);
              const displayName = agentName ?? targetAgent?.name ?? agentId;

              if (!targetAgent) {
                throw new Error(`Agent "${displayName}" (${agentId}) not found in this orchestrator`);
              }

              await log("info", `→ Delegating to agent "${displayName}": ${prompt.slice(0, 80)}${prompt.length > 80 ? "…" : ""}`);

              const childTask = await storage.createTask({
                orchestratorId: task.orchestratorId,
                agentId,
                input: prompt,
                status: "pending",
                intent: "conversational",
                priority: task.priority ?? 5,
                parentTaskId: taskId,
              });

              await executeTask(childTask.id);

              const completed = await storage.getTask(childTask.id);
              const output = completed?.output ?? "(no output)";
              await log("info", `← Agent "${displayName}" completed (${output.length} chars)`);
              return { displayName, output };
            })
          );

          for (const result of spawnResults) {
            if (result.status === "fulfilled") {
              messages.push({
                role: "user",
                content: `Tool spawn_agent result (${result.value.displayName}):\n${result.value.output}`,
              });
            } else {
              const errMsg = result.reason?.message ?? String(result.reason);
              await log("error", `spawn_agent failed: ${errMsg}`);
              messages.push({ role: "user", content: `Tool spawn_agent result: ERROR — ${errMsg}` });
            }
          }
        }

        toolRounds++;
      }

      if (!done) {
        await log("warn", `Max tool rounds (${MAX_TOOL_ROUNDS}) reached — requesting final answer`);
        const finalResult = await runAgentWithFailover(orchestrator, {
          systemPrompt,
          messages: [...messages, { role: "user", content: "Please provide your final answer based on the tool results above." }],
          maxTokens: agent?.maxTokens ?? 4096,
          temperature: agent?.temperature ?? 70,
          onChunk: (chunk) => {
            taskLogEmitter.emit(`task:${taskId}:stream`, chunk);
          },
        }, log);
        output = finalResult.content;
        if (finalResult.usage) {
          totalInputTokens += finalResult.usage.inputTokens;
          totalOutputTokens += finalResult.usage.outputTokens;
        }
      }
    }

    await log("info", `Task completed — output length: ${output.length} chars${approvalRequested ? " (approval pending)" : ""}`);

    if (agent?.memoryEnabled && agent) {
      await storage.setAgentMemory(agent.id, "last_task_output", output.slice(0, 500));
      generateEmbedding(output.slice(0, 4000))
        .then((emb) => {
          if (emb) {
            storage.storeVectorMemory(agent.id, orchestrator.workspaceId, output, emb, "task_output", taskId).catch(() => {});
          }
        })
        .catch(() => {});
    }

    await storage.updateTask(taskId, {
      status: "completed",
      output,
      completedAt: new Date(),
    });
    taskLogEmitter.emit(`task:${taskId}`, { type: "done", status: "completed" });

    if (commsThread) {
      storage.appendCommsThreadHistory(commsThread.id, { role: "user", content: task.input }).catch(console.error);
      storage.appendCommsThreadHistory(commsThread.id, { role: "assistant", content: output }).catch(console.error);
    }

    if (totalInputTokens > 0 || totalOutputTokens > 0) {
      const costUsd = estimateTokenCost(orchestrator.provider, orchestrator.model, totalInputTokens, totalOutputTokens);
      await storage.createTokenUsage({
        workspaceId: orchestrator.workspaceId,
        taskId,
        agentId: agent?.id ?? null,
        agentName: agent?.name || `${orchestrator.name} (direct)`,
        provider: orchestrator.provider,
        model: orchestrator.model,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        estimatedCostUsd: costUsd,
      }).catch(console.error);
      await log("info", `Token usage: ${totalInputTokens} in / ${totalOutputTokens} out (~$${costUsd.toFixed(6)})`);

      // Utilization threshold alert (best-effort, fire when crossing threshold)
      storage.getWorkspaceConfig(orchestrator.workspaceId).then(async (cfg) => {
        if (!cfg?.utilizationAlertThresholdTokens || !cfg?.utilizationAlertChannelId) return;
        const stats = await storage.getWorkspaceTokenStats(orchestrator.workspaceId, 30);
        const newTotal = stats.totalInputTokens + stats.totalOutputTokens;
        const prevTotal = newTotal - totalInputTokens - totalOutputTokens;
        if (prevTotal < cfg.utilizationAlertThresholdTokens && newTotal >= cfg.utilizationAlertThresholdTokens) {
          dispatchToChannel(
            cfg.utilizationAlertChannelId,
            "⚠️ Token Utilization Threshold Exceeded",
            `Workspace has used ${newTotal.toLocaleString()} tokens this month (threshold: ${cfg.utilizationAlertThresholdTokens.toLocaleString()}).`,
          ).catch(console.error);
        }
      }).catch(console.error);
    }

    if (task.isHeartbeat && agent) {
      const silencePhrase = agent.heartbeatSilencePhrase ?? "HEARTBEAT_OK";
      const trimmed = output.trim();
      const isSilenced =
        trimmed === silencePhrase ||
        trimmed.startsWith(silencePhrase) ||
        trimmed.endsWith(silencePhrase);

      if (isSilenced) {
        await log("info", `Heartbeat suppressed (${silencePhrase}) — no alert dispatched`);
        return;
      }

      await log("info", `Heartbeat has content — dispatching alert`);

      if ((task as any).notifyChannelId) {
        dispatchToChannel(
          (task as any).notifyChannelId,
          `🔔 Heartbeat Alert — ${agent.name}`,
          output.slice(0, 500),
        ).catch(console.error);
      } else {
        await log("warn", "Heartbeat alert fired but no notify channel configured — set a Heartbeat Notify Channel on the agent to receive alerts");
      }
      return;
    }

    if ((task as any).notifyChannelId) {
      dispatchToChannel(
        (task as any).notifyChannelId,
        `✅ Task Completed${agent ? ` — ${agent.name}` : ""}`,
        output.slice(0, 500),
      ).catch(console.error);
    }

    dispatchNotification(orchestrator.id, "task.completed", {
      taskId,
      agentName: agent?.name,
      summary: output.slice(0, 300),
    }).catch(console.error);

    if (task.commsThreadId) {
      dispatchCommsReply(task.commsThreadId, output).catch(console.error);
    }
  } catch (err: any) {
    const message = err?.message ?? String(err);
    await log("error", `Task failed: ${message}`);

    const retryCount = (task as any).retryCount ?? 0;
    const maxRetries = orchestrator.maxRetries ?? 2;

    if (retryCount < maxRetries) {
      const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 30_000);
      await log("warn", `Retrying task (attempt ${retryCount + 1}/${maxRetries}) in ${backoffMs}ms`);
      await storage.updateTask(taskId, {
        status: "failed",
        errorMessage: `${message} (retrying...)`,
        completedAt: new Date(),
      });
      taskLogEmitter.emit(`task:${taskId}`, { type: "done", status: "failed" });
      setTimeout(async () => {
        try {
          const retryTask = await storage.createTask({
            orchestratorId: task.orchestratorId,
            agentId: task.agentId ?? undefined,
            channelId: task.channelId ?? undefined,
            commsThreadId: task.commsThreadId ?? undefined,
            input: task.input,
            status: "pending",
            priority: task.priority ?? 5,
            intent: task.intent ?? undefined,
            parentTaskId: task.parentTaskId ?? undefined,
            bypassApproval: (task as any).bypassApproval ?? false,
            retryCount: retryCount + 1,
          });
          await executeTask(retryTask.id);
        } catch (retryErr: any) {
          console.error(`[executor] Retry failed for task ${taskId}:`, retryErr);
        }
      }, backoffMs);
    } else {
      await storage.updateTask(taskId, {
        status: "failed",
        errorMessage: message,
        completedAt: new Date(),
      });
      taskLogEmitter.emit(`task:${taskId}`, { type: "done", status: "failed" });
      dispatchNotification(orchestrator.id, "task.failed", {
        taskId,
        agentName: agent?.name,
        error: message,
      }).catch(console.error);
    }
  }
}

type LoadedCredential = CloudCredentials & { integrationId: string };

async function loadCloudCredentials(
  workspaceId: string,
  log: (level: "info" | "warn" | "error", msg: string) => Promise<void>
): Promise<LoadedCredential[]> {
  const integrations = await storage.getCloudIntegrationsForWorkspace(workspaceId);
  const loaded: LoadedCredential[] = [];

  for (const integration of integrations) {
    try {
      const decrypted = decrypt(integration.credentialsEncrypted);
      const raw = JSON.parse(decrypted);

      if (integration.provider === "aws") {
        loaded.push({
          integrationId: integration.id,
          provider: "aws",
          credentials: {
            accessKeyId: raw.accessKeyId,
            secretAccessKey: raw.secretAccessKey,
            region: raw.region,
          },
        });
      } else if (integration.provider === "gcp") {
        loaded.push({
          integrationId: integration.id,
          provider: "gcp",
          credentials: { serviceAccountJson: raw },
        });
      } else if (integration.provider === "azure") {
        loaded.push({
          integrationId: integration.id,
          provider: "azure",
          credentials: {
            clientId: raw.clientId,
            clientSecret: raw.clientSecret,
            tenantId: raw.tenantId,
            subscriptionId: raw.subscriptionId,
          },
        });
      } else if (integration.provider === "ragflow") {
        loaded.push({
          integrationId: integration.id,
          provider: "ragflow",
          credentials: {
            baseUrl: raw.baseUrl,
            apiKey: raw.apiKey,
          },
        });
      } else if (integration.provider === "jira") {
        loaded.push({
          integrationId: integration.id,
          provider: "jira",
          credentials: {
            baseUrl: raw.baseUrl,
            email: raw.email,
            apiToken: raw.apiToken,
            defaultProjectKey: raw.defaultProjectKey,
          },
        });
      } else if (integration.provider === "github") {
        loaded.push({
          integrationId: integration.id,
          provider: "github",
          credentials: {
            token: raw.token,
            defaultOwner: raw.defaultOwner,
          },
        });
      } else if (integration.provider === "gitlab") {
        loaded.push({
          integrationId: integration.id,
          provider: "gitlab",
          credentials: {
            baseUrl: raw.baseUrl,
            token: raw.token,
            defaultProjectId: raw.defaultProjectId,
          },
        });
      } else if (integration.provider === "teams") {
        loaded.push({
          integrationId: integration.id,
          provider: "teams",
          credentials: { webhookUrl: raw.webhookUrl },
        });
      } else if (integration.provider === "slack") {
        loaded.push({
          integrationId: integration.id,
          provider: "slack",
          credentials: { botToken: raw.botToken, defaultChannel: raw.defaultChannel },
        });
      } else if (integration.provider === "google_chat") {
        loaded.push({
          integrationId: integration.id,
          provider: "google_chat",
          credentials: { webhookUrl: raw.webhookUrl },
        });
      } else if (integration.provider === "servicenow") {
        loaded.push({
          integrationId: integration.id,
          provider: "servicenow",
          credentials: {
            instanceUrl: raw.instanceUrl,
            username: raw.username,
            password: raw.password,
          },
        });
      } else if (integration.provider === "postgresql") {
        loaded.push({
          integrationId: integration.id,
          provider: "postgresql",
          credentials: { connectionString: raw.connectionString },
        });
      } else if (integration.provider === "kubernetes") {
        loaded.push({
          integrationId: integration.id,
          provider: "kubernetes",
          credentials: {
            apiServer: raw.apiServer,
            bearerToken: raw.bearerToken,
            caCertBase64: raw.caCertBase64,
            insecureSkipTlsVerify: raw.insecureSkipTlsVerify,
            kubeconfigJson: raw.kubeconfigJson,
            defaultNamespace: raw.defaultNamespace,
          },
        });
      }
    } catch {
      await log("warn", `Failed to load credentials for integration "${integration.name}" — skipping`);
    }
  }

  return loaded;
}

function buildToolList(creds: LoadedCredential[], includeCodeInterpreter = false, agents: Agent[] = []): ToolDefinition[] {
  const tools: ToolDefinition[] = [REQUEST_APPROVAL_TOOL];
  if (includeCodeInterpreter) {
    tools.push(CODE_INTERPRETER_TOOL);
  }
  if (agents.length > 1) {
    tools.push(SPAWN_AGENT_TOOL);
  }
  for (const cred of creds) {
    tools.push(...getToolsForProvider(cred.provider));
  }
  return tools;
}

function buildSystemPrompt(orchestrator: Orchestrator, agent: Agent | null, hasCloudTools: boolean, agents: Agent[] = []): string {
  const parts: string[] = [];

  if (orchestrator.systemPrompt) {
    parts.push(`Orchestrator Instructions:\n${orchestrator.systemPrompt}`);
  }

  if (agent?.instructions) {
    parts.push(`Agent Instructions:\n${agent.instructions}`);
  }

  if (hasCloudTools) {
    parts.push(
      `You have access to tools for cloud providers, developer platforms, messaging services, ITSM, databases, and Kubernetes (AWS, GCP, Azure, RAGFlow, Jira, GitHub, GitLab, MS Teams, Slack, Google Chat, ServiceNow, PostgreSQL, Kubernetes). ` +
      `When the user asks about resources or operations on any of these platforms, use the appropriate tool to fetch real data, send messages, query databases, or manage cluster workloads. ` +
      `For Kubernetes: use kube_* tools to inspect pods, deployments, services, configs, storage, jobs, and cluster state. Use kube_apply_manifest and kube_scale_deployment for write operations. Always summarize tool results in a clear, human-readable format.`
    );
  }

  if (agents.length > 1) {
    const otherAgents = agent ? agents.filter((a) => a.id !== agent.id) : agents;
    if (otherAgents.length > 0) {
      const agentList = otherAgents
        .map((a) => `  - "${a.name}" (agentId: ${a.id})${a.instructions ? ` — ${a.instructions.slice(0, 80)}${a.instructions.length > 80 ? "…" : ""}` : ""}`)
        .join("\n");
      parts.push(
        `You can delegate subtasks to specialist agents using the spawn_agent tool. ` +
        `Multiple spawn_agent calls in the same response run in parallel automatically — use this for independent subtasks to save time.\n\n` +
        `Available agents for delegation:\n${agentList}`
      );
    }
  }

  if (agent?.reactEnabled) {
    parts.push(
      `Reasoning Protocol — you MUST follow this for every step:\n` +
      `1. Before each tool call write a THOUGHT block:\n` +
      `   Thought: <current goal> | <what you know so far> | <why this specific action next> | <what you expect to find>\n` +
      `2. After receiving a tool result write an OBSERVE block:\n` +
      `   Observe: <what the result tells you> | <does it change your plan?>\n` +
      `3. Repeat until the goal is achieved.\n` +
      `4. End with a final Thought confirming the goal was fully achieved or stating what is still missing.\n` +
      `Keep THOUGHT and OBSERVE blocks concise (1–3 sentences each). Never skip them.`
    );
  }

  if (parts.length === 0) {
    parts.push("You are a helpful AI assistant.");
  }

  return parts.join("\n\n");
}
