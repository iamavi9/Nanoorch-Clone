import { spawn } from "child_process";
import { existsSync } from "fs";
import * as readline from "readline";
import { storage } from "../storage";
import { decrypt } from "../lib/encryption";
import { executeCloudTool, type CloudCredentials } from "../cloud/executor";
import { getToolsForProvider, detectProviderFromToolName } from "../cloud/tools";
import { sanitizeToolArgs } from "../lib/mountAllowlist";
import { taskLogEmitter } from "./emitter";
import type { Orchestrator, Agent } from "@shared/schema";
import type { ProviderMessage } from "../providers";
import { executeCodeInSandbox } from "./sandbox-executor";
import { issueTaskToken, revokeTaskToken, getAndClearProxiedUsage } from "../proxy/inference-proxy";
import { generateEmbedding } from "../lib/embeddings";
import { estimateTokenCost } from "./token-cost";
import { getRepoWorkspace } from "./git-clone";

const MAX_TOOL_ROUNDS = 10;
const CONTAINER_TIMEOUT_MS = 180_000;

// Optional gVisor runtime for agent containers.
// Set AGENT_RUNTIME=runsc to enable kernel-level isolation via gVisor.
// Leave unset (or set to "runc") to use the default container runtime.
const AGENT_RUNTIME = process.env.AGENT_RUNTIME ?? "";

export function isDockerAvailable(): boolean {
  return !!process.env.DOCKER_SOCKET;
}


type LoadedCredential = CloudCredentials & { integrationId: string };

export async function executeTaskInDocker(taskId: string): Promise<void> {
  const task = await storage.getTask(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  const orchestrator = await storage.getOrchestrator(task.orchestratorId);
  if (!orchestrator) throw new Error(`Orchestrator not found`);

  const agent = task.agentId ? await storage.getAgent(task.agentId) : null;

  await storage.updateTask(taskId, { status: "running", startedAt: new Date() });

  const log = async (
    level: "info" | "warn" | "error",
    message: string,
    metadata?: Record<string, unknown>,
    logType?: string,
    parentLogId?: number,
  ) => {
    const entry = await storage.createTaskLog({ taskId, level, message, metadata, logType: logType ?? "info", parentLogId });
    taskLogEmitter.emit(`task:${taskId}`, { ...entry, timestamp: entry.timestamp ?? new Date() });
    return entry;
  };

  // Decrypt vLLM API key if this orchestrator uses vLLM (self-hosted inference server).
  let vllmApiKey: string | null = null;
  if (orchestrator.provider === "vllm" && (orchestrator as any).vllmApiKey) {
    try {
      const { decrypt } = await import("../lib/encryption");
      vllmApiKey = decrypt((orchestrator as any).vllmApiKey);
    } catch {
      // If decryption fails (key changed), proceed without key
    }
  }

  // Issue a short-lived proxy token for this task.  The agent container
  // receives this token instead of real API keys; the inference proxy on
  // the host verifies it and injects the real credential server-side.
  const taskToken = issueTaskToken(taskId);

  try {
    await log("info", `Task started in Docker sandbox — provider: ${orchestrator.provider}, model: ${orchestrator.model}`);
    await log("info", "Inference proxy: real API keys will not be passed to the container");

    const cloudCreds = await loadCloudCredentials(orchestrator.workspaceId, log);
    const availableTools = buildToolList(cloudCreds);

    if (availableTools.length > 0) {
      await log("info", `Cloud integrations: ${cloudCreds.map((c) => c.provider).join(", ")} (${availableTools.length} tools available)`);
    }

    const messages: ProviderMessage[] = [];

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

    const systemPrompt = buildSystemPrompt(orchestrator, agent, availableTools.length > 0);

    await log("info", `Spawning ephemeral container for agent${agent ? ` "${agent.name}"` : ""}`);

    let output = "";
    let toolRounds = 0;

    while (toolRounds <= MAX_TOOL_ROUNDS) {
      const roundResult = await runInContainer({
        taskId,
        round: toolRounds,
        orchestrator,
        agent,
        systemPrompt,
        messages,
        tools: availableTools,
        taskToken,
        vllmApiKey,
        log,
      });

      if (roundResult.type === "result") {
        output = roundResult.output;
        taskLogEmitter.emit(`task:${taskId}:stream`, output);
        break;
      }

      if (roundResult.type === "tool_calls") {
        if (roundResult.assistantContent) {
          await log("info", roundResult.assistantContent, {}, "reasoning");
          messages.push({ role: "assistant", content: roundResult.assistantContent });
        }

        for (const toolCall of roundResult.toolCalls) {
          if (toolCall.name === "code_interpreter") {
            const { language, code } = toolCall.arguments as { language: string; code: string };
            const callEntry = await log("info", `Running ${language} code in sandbox`, { tool: "code_interpreter", args: { language, code: code.slice(0, 200) } }, "tool_call");
            try {
              const sandboxResult = await executeCodeInSandbox(language, code);
              const resultText = sandboxResult.exitCode === 0
                ? `exit_code: 0\nstdout:\n${sandboxResult.stdout || "(no output)"}`
                : `exit_code: ${sandboxResult.exitCode}\nstdout:\n${sandboxResult.stdout || "(no output)"}\nstderr:\n${sandboxResult.stderr || "(none)"}`;
              await log("info", `Sandbox: exit ${sandboxResult.exitCode}`, { result: resultText.slice(0, 500) }, "tool_result", callEntry.id);
              messages.push({ role: "user", content: `Tool code_interpreter result:\n${resultText}` });
            } catch (err: any) {
              await log("error", `Sandbox execution failed: ${err.message}`, {}, "tool_result", callEntry.id);
              messages.push({ role: "user", content: `Tool code_interpreter result: ERROR — ${err.message}` });
            }
            continue;
          }

          const cloudProvider = detectProviderFromToolName(toolCall.name);
          const safeArgs = sanitizeToolArgs(toolCall.arguments);
          const callEntry = await log("info", `Calling tool: ${toolCall.name}`, { tool: toolCall.name, args: safeArgs }, "tool_call");

          const matchedCred = cloudCreds.find((c) => c.provider === cloudProvider);
          if (!matchedCred) {
            const errMsg = `No active ${cloudProvider} integration found for this workspace`;
            await log("warn", errMsg, {}, "tool_result", callEntry.id);
            messages.push({ role: "user", content: `Tool ${toolCall.name} result: ERROR — ${errMsg}` });
            continue;
          }

          try {
            const toolResult = await executeCloudTool(toolCall.name, toolCall.arguments, matchedCred);
            await storage.touchCloudIntegration(matchedCred.integrationId);
            const resultStr = JSON.stringify(toolResult, null, 2);
            await log("info", `Tool ${toolCall.name} completed`, { result: resultStr.slice(0, 1000), resultLength: resultStr.length }, "tool_result", callEntry.id);
            messages.push({ role: "user", content: `Tool ${toolCall.name} result:\n${resultStr}` });
          } catch (toolErr: any) {
            const errMsg = toolErr?.message ?? String(toolErr);
            await log("error", `Tool ${toolCall.name} failed: ${errMsg}`, {}, "tool_result", callEntry.id);
            messages.push({ role: "user", content: `Tool ${toolCall.name} result: ERROR — ${errMsg}` });
          }
        }

        toolRounds++;
        continue;
      }

      break;
    }

    if (!output && toolRounds >= MAX_TOOL_ROUNDS) {
      await log("warn", `Max tool rounds (${MAX_TOOL_ROUNDS}) reached`);
      const finalResult = await runInContainer({
        taskId,
        round: toolRounds,
        orchestrator,
        agent,
        systemPrompt,
        messages: [...messages, { role: "user", content: "Please provide your final answer based on the tool results above." }],
        tools: [],
        taskToken,
        vllmApiKey,
        log,
      });
      if (finalResult.type === "result") {
        output = finalResult.output;
        taskLogEmitter.emit(`task:${taskId}:stream`, output);
      }
    }

    await log("info", `Task completed in sandbox — output length: ${output.length} chars`);

    // Record token usage captured by the inference proxy for this task.
    const proxiedUsage = getAndClearProxiedUsage(taskId);
    if (proxiedUsage && (proxiedUsage.inputTokens > 0 || proxiedUsage.outputTokens > 0)) {
      const costUsd = estimateTokenCost(orchestrator.provider, orchestrator.model, proxiedUsage.inputTokens, proxiedUsage.outputTokens);
      storage.createTokenUsage({
        workspaceId: orchestrator.workspaceId,
        taskId,
        agentId:   agent?.id   ?? null,
        agentName: agent?.name || `${orchestrator.name} (direct)`,
        provider:  orchestrator.provider,
        model:     orchestrator.model,
        inputTokens:      proxiedUsage.inputTokens,
        outputTokens:     proxiedUsage.outputTokens,
        estimatedCostUsd: costUsd,
      }).catch(console.error);
      await log("info", `Token usage: ${proxiedUsage.inputTokens} in / ${proxiedUsage.outputTokens} out (~$${costUsd.toFixed(6)})`);
    }

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
  } catch (err: any) {
    const message = err?.message ?? String(err);
    // "Connection error." is the OpenAI SDK's APIConnectionError — the agent
    // container could not reach the inference proxy.  Emit a hint that includes
    // the resolved proxy base URL so the operator knows what to check.
    const isConnErr = /^connection error\.?$/i.test(message.trim());
    const _hintRaw = process.env.DOCKER_PROXY_URL?.trim();
    const _hintProxy = _hintRaw
      ? _hintRaw.replace(/\/$/, "")
      : `http://host.docker.internal:${process.env.PORT ?? "5000"}/internal/proxy`;
    const hint = isConnErr
      ? ` — agent container could not reach the inference proxy. Check that DOCKER_PROXY_URL (currently: ${_hintProxy}) is reachable from spawned containers. On Docker Engine < 20.10, set DOCKER_PROXY_URL explicitly (e.g. http://172.17.0.1:${process.env.PORT ?? "5000"}/internal/proxy).`
      : "";
    await log("error", `Task failed in sandbox: ${message}${hint}`);
    await storage.updateTask(taskId, {
      status: "failed",
      errorMessage: message + (isConnErr ? " (inference proxy unreachable — see server logs)" : ""),
      completedAt: new Date(),
    });
    taskLogEmitter.emit(`task:${taskId}`, { type: "done", status: "failed" });
  } finally {
    // Always revoke the proxy token — containers can no longer call AI APIs
    // after the task finishes, regardless of how it ended.
    revokeTaskToken(taskId);
  }
}

type ContainerResult =
  | { type: "result"; output: string }
  | { type: "tool_calls"; toolCalls: Array<{ id: string; name: string; arguments: Record<string, string> }>; assistantContent: string };

async function runInContainer(opts: {
  taskId: string;
  round: number;
  orchestrator: Orchestrator;
  agent: Agent | null;
  systemPrompt: string;
  messages: ProviderMessage[];
  tools: ReturnType<typeof buildToolList>;
  taskToken: string;
  vllmApiKey: string | null;
  log: (level: "info" | "warn" | "error", msg: string, metadata?: Record<string, unknown>, logType?: string, parentLogId?: number) => Promise<any>;
}): Promise<ContainerResult> {
  const { taskId, round, orchestrator, agent, systemPrompt, messages, tools, taskToken, vllmApiKey, log } = opts;

  const agentImage = process.env.AGENT_IMAGE ?? "nanoorch-agent:latest";

  const messagesB64 = Buffer.from(JSON.stringify(messages)).toString("base64");
  const toolsB64 = Buffer.from(JSON.stringify(tools)).toString("base64");

  // Determine the inference proxy base URL.
  // Override with DOCKER_PROXY_URL if set to a non-empty value (useful when
  // host.docker.internal does not resolve — e.g. Docker Engine < 20.10 or
  // custom network topologies).
  // Default: agent containers reach NanoOrch via host.docker.internal resolved
  // by --add-host host.docker.internal:host-gateway below.
  const hostPort = process.env.PORT ?? "5000";
  const rawProxyUrl = process.env.DOCKER_PROXY_URL?.trim();
  const proxyBase = rawProxyUrl
    ? rawProxyUrl.replace(/\/$/, "")
    : `http://host.docker.internal:${hostPort}/internal/proxy`;

  // The container receives a short-lived task token instead of real API keys.
  // The inference proxy on the host verifies the token and injects the real
  // credential before forwarding to the upstream provider.
  // Check if a cloned repo directory was registered for this task (git agents).
  const repoDir = getRepoWorkspace(taskId);

  const envArgs: string[] = [
    "--env", `TASK_ID=${taskId}`,
    "--env", `PROVIDER=${orchestrator.provider}`,
    "--env", `MODEL=${orchestrator.model}`,
    "--env", `MAX_TOKENS=${agent?.maxTokens ?? 4096}`,
    "--env", `TEMPERATURE=${agent?.temperature ?? 70}`,
    "--env", `SYSTEM_PROMPT=${systemPrompt}`,
    "--env", `MESSAGES_JSON=${messagesB64}`,
    "--env", `TOOLS_JSON=${toolsB64}`,
    // Pass the task token as every provider key — the proxy accepts it for any
    // configured provider regardless of which "key" the SDK sends.
    "--env", `OPENAI_API_KEY=${taskToken}`,
    "--env", `OPENAI_BASE_URL=${proxyBase}/openai/v1`,
    "--env", `ANTHROPIC_API_KEY=${taskToken}`,
    "--env", `ANTHROPIC_BASE_URL=${proxyBase}/anthropic`,
    "--env", `GEMINI_API_KEY=${taskToken}`,
    "--env", `GEMINI_BASE_URL=${proxyBase}/gemini`,
    // vLLM: pass base URL and optional API key directly to the container.
    // vLLM is a self-hosted server, so no proxy is needed — the container
    // connects directly to the vLLM inference server using the OpenAI-compatible API.
    ...(orchestrator.provider === "vllm" ? [
      "--env", `VLLM_API_KEY=${vllmApiKey || "vllm"}`,
      "--env", `VLLM_BASE_URL=${(orchestrator.baseUrl ?? "http://localhost:8000").replace(/\/$/, "") + "/v1"}`,
    ] : []),
    // Git agent: tell the container where the repo is mounted (if available).
    ...(repoDir ? ["--env", "GIT_WORKSPACE=/workspace"] : []),
  ];

  const containerName = `nanoorch-agent-${taskId.slice(0, 8)}-r${round}`;

  const dockerArgs = [
    "run", "--rm",
    "--name", containerName,
    "--memory", "512m",
    "--cpus", "0.5",
    "--network", "bridge",
    // Resolve host.docker.internal → Docker bridge gateway so the container
    // can reach the NanoOrch inference proxy running on the host.
    "--add-host", "host.docker.internal:host-gateway",
    // Drop all Linux capabilities — the agent container only needs to make
    // outbound HTTPS calls; no special capabilities are required for that.
    "--cap-drop", "ALL",
    // Prevent any in-container process from gaining new privileges via setuid
    // binaries or filesystem capabilities.
    "--security-opt", "no-new-privileges",
    // Optional gVisor isolation.  Set AGENT_RUNTIME=runsc in the environment
    // to enable kernel-level sandboxing for agent containers.
    ...(AGENT_RUNTIME && AGENT_RUNTIME !== "runc"
      ? ["--runtime", AGENT_RUNTIME]
      : []),
    // Optional custom seccomp profile (host path).
    ...(process.env.SECCOMP_PROFILE
      ? existsSync(process.env.SECCOMP_PROFILE)
        ? ["--security-opt", `seccomp=${process.env.SECCOMP_PROFILE}`]
        : (console.warn(`[agent] SECCOMP_PROFILE is set but file not found at ${process.env.SECCOMP_PROFILE} — seccomp disabled. Copy agent/seccomp/nanoorch.json to that path.`), [])
      : []),
    // Git agent: mount the cloned repository read-only at /workspace inside the container.
    // GIT_WORKSPACE=/workspace env var tells the agent where to find the code.
    ...(repoDir ? ["--volume", `${repoDir}:/workspace:ro`] : []),
    ...envArgs,
    agentImage,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn("docker", dockerArgs, { stdio: ["ignore", "pipe", "pipe"] });

    const rl = readline.createInterface({ input: proc.stdout! });
    let containerResult: ContainerResult | null = null;
    let timedOut = false;

    const timer = setTimeout(async () => {
      timedOut = true;
      proc.kill("SIGKILL");
      await log("error", `Container ${containerName} timed out after ${CONTAINER_TIMEOUT_MS / 1000}s`);
      reject(new Error(`Container timed out`));
    }, CONTAINER_TIMEOUT_MS);

    rl.on("line", async (line) => {
      line = line.trim();
      if (!line) return;
      try {
        const parsed = JSON.parse(line);

        if (parsed.type === "log") {
          await log(parsed.level ?? "info", `[sandbox] ${parsed.message}`);
        } else if (parsed.type === "token") {
          // Relay individual LLM tokens directly to the frontend — not stored to DB
          taskLogEmitter.emit(`task:${opts.taskId}:token`, parsed.content ?? "");
        } else if (parsed.type === "result") {
          containerResult = { type: "result", output: parsed.output ?? "" };
        } else if (parsed.type === "tool_calls") {
          containerResult = {
            type: "tool_calls",
            toolCalls: parsed.toolCalls ?? [],
            assistantContent: parsed.assistantContent ?? "",
          };
        } else if (parsed.type === "error") {
          reject(new Error(parsed.message ?? "Container error"));
        }
      } catch {
        await log("warn", `[sandbox] non-JSON output: ${line.slice(0, 200)}`);
      }
    });

    proc.stderr!.on("data", async (data) => {
      const text = data.toString().trim();
      if (text) await log("warn", `[sandbox stderr] ${text.slice(0, 500)}`);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return;
      if (containerResult) {
        resolve(containerResult);
      } else if (code !== 0) {
        reject(new Error(`Container exited with code ${code}`));
      } else {
        reject(new Error("Container exited without producing output"));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn container: ${err.message}`));
    });
  });
}


async function loadCloudCredentials(
  workspaceId: string,
  log: (level: "info" | "warn" | "error", msg: string) => Promise<any>
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
          credentials: { instanceUrl: raw.instanceUrl, username: raw.username, password: raw.password },
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

function buildToolList(creds: LoadedCredential[]) {
  const tools: ReturnType<typeof getToolsForProvider> = [];
  for (const cred of creds) {
    tools.push(...getToolsForProvider(cred.provider));
  }
  return tools;
}

function buildSystemPrompt(orchestrator: Orchestrator, agent: Agent | null, hasCloudTools: boolean): string {
  const parts: string[] = [];

  if (orchestrator.systemPrompt) {
    parts.push(`Orchestrator Instructions:\n${orchestrator.systemPrompt}`);
  }

  if (agent?.instructions) {
    parts.push(`Agent Instructions:\n${agent.instructions}`);
  }

  if (hasCloudTools) {
    parts.push(
      `You have access to tools for cloud providers, developer platforms, messaging services, ITSM, and databases (AWS, GCP, Azure, RAGFlow, Jira, GitHub, GitLab, MS Teams, Slack, Google Chat, ServiceNow, PostgreSQL). ` +
      `When the user asks about resources or operations on any of these platforms, use the appropriate tool to fetch real data, send messages, or query databases. ` +
      `Always summarize tool results in a clear, human-readable format.`
    );
  }

  if (parts.length === 0) {
    parts.push("You are a helpful AI assistant.");
  }

  return parts.join("\n\n");
}
