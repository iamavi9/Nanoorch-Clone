/**
 * K3s Executor — runs agent tasks as Kubernetes Jobs inside an embedded K3s cluster.
 *
 * Activated when SANDBOX_MODE=k3s.  Each agent invocation becomes a K8s Job in the
 * "agent-sandboxes" namespace.  NetworkPolicy restricts pod egress to port 3000 only
 * (the NanoOrch inference proxy), so agent containers can never reach AI providers
 * directly — the proxy strips the task token and injects real credentials server-side.
 *
 * Credentials are NEVER passed to the pod.  The pod receives only a short-lived task
 * token that the inference proxy validates before forwarding to the upstream provider.
 *
 * Setup: docker compose -f docker-compose.k3s.yml up -d
 */

import { spawn } from "child_process";
import * as readline from "readline";
import * as os from "os";
import { storage } from "../storage";
import { taskLogEmitter } from "./emitter";
import { executeCloudTool } from "../cloud/executor";
import { detectProviderFromToolName } from "../cloud/tools";
import { sanitizeToolArgs } from "../lib/mountAllowlist";
import { issueTaskToken, revokeTaskToken, getAndClearProxiedUsage } from "../proxy/inference-proxy";
import { generateEmbedding } from "../lib/embeddings";
import { estimateTokenCost } from "./token-cost";
import { loadCloudCredentials, buildToolList, buildSystemPrompt } from "./agent-helpers";
import type { ProviderMessage } from "../providers";
import type { Orchestrator, Agent } from "@shared/schema";

const KUBECONFIG_PATH  = process.env.KUBECONFIG      ?? "";
const K3S_NAMESPACE    = process.env.K3S_NAMESPACE   ?? "agent-sandboxes";
const AGENT_IMAGE      = process.env.AGENT_IMAGE     ?? "registry:5000/nanoorch-agent:latest";
const K3S_PROXY_URL    = process.env.K3S_PROXY_URL   ?? "http://nanoorch-app:3000/internal/proxy";

const POD_SCHEDULE_TIMEOUT_MS = 120_000;
const JOB_TIMEOUT_MS          = 180_000;
const MAX_TOOL_ROUNDS         = 10;

// ── Proxy service bootstrap ────────────────────────────────────────────────
// Creates a Kubernetes Service + Endpoints in agent-sandboxes so pods can
// reach the NanoOrch inference proxy via a stable K8s service name.
// This runs lazily on first task so the app container is always up when called.

let proxyServiceEnsured = false;

function getContainerIP(): string | null {
  for (const addrs of Object.values(os.networkInterfaces())) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === "IPv4" && !addr.internal) return addr.address;
    }
  }
  return null;
}

async function ensureProxyService(): Promise<void> {
  if (proxyServiceEnsured) return;

  const appIP = getContainerIP();
  if (!appIP) {
    console.warn("[k3s] Could not determine container IP — nanoorch-app service not created");
    return;
  }

  const manifest = [
    "apiVersion: v1",
    "kind: Service",
    "metadata:",
    `  name: nanoorch-app`,
    `  namespace: ${K3S_NAMESPACE}`,
    "spec:",
    "  ports:",
    "    - port: 3000",
    "      protocol: TCP",
    "      targetPort: 3000",
    "---",
    "apiVersion: v1",
    "kind: Endpoints",
    "metadata:",
    `  name: nanoorch-app`,
    `  namespace: ${K3S_NAMESPACE}`,
    "subsets:",
    "  - addresses:",
    `      - ip: ${appIP}`,
    "    ports:",
    "      - port: 3000",
  ].join("\n");

  await kubectl(["apply", "-f", "-"], manifest);
  console.log(`[k3s] Proxy service nanoorch-app ensured → ${appIP}:3000`);
  proxyServiceEnsured = true;
}

export function isK3sAvailable(): boolean {
  return process.env.SANDBOX_MODE === "k3s" && !!KUBECONFIG_PATH;
}

export async function executeTaskInK3s(taskId: string): Promise<void> {
  await ensureProxyService();

  const task = await storage.getTask(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  const orchestrator = await storage.getOrchestrator(task.orchestratorId);
  if (!orchestrator) throw new Error(`Orchestrator not found`);

  const agent = task.agentId ? await storage.getAgent(task.agentId) : null;

  await storage.updateTask(taskId, { status: "running", startedAt: new Date() });

  const log = async (level: "info" | "warn" | "error", message: string, metadata?: Record<string, unknown>) => {
    const entry = await storage.createTaskLog({ taskId, level, message, metadata });
    taskLogEmitter.emit(`task:${taskId}`, { ...entry, timestamp: entry.timestamp ?? new Date() });
  };

  const taskToken = issueTaskToken(taskId);

  // Decrypt vLLM API key if applicable (self-hosted inference server — not proxied).
  let vllmApiKey: string | null = null;
  if (orchestrator.provider === "vllm" && (orchestrator as any).vllmApiKey) {
    try {
      const { decrypt } = await import("../lib/encryption");
      vllmApiKey = decrypt((orchestrator as any).vllmApiKey);
    } catch {
      // Proceed without key if decryption fails
    }
  }

  try {
    await log("info", `Task started in K3s sandbox — provider: ${orchestrator.provider}, model: ${orchestrator.model}`);
    await log("info", "K3s mode: agent pods are network-isolated, credentials are never exposed to containers");

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

    await log("info", `Spawning K3s Job for agent${agent ? ` "${agent.name}"` : ""}`);

    let output = "";
    let toolRounds = 0;

    while (toolRounds <= MAX_TOOL_ROUNDS) {
      const roundResult = await runInK3sJob({
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
          messages.push({ role: "assistant", content: roundResult.assistantContent });
        }

        for (const toolCall of roundResult.toolCalls) {
          if (toolCall.name === "code_interpreter") {
            await log("warn", "code_interpreter is not available in K3s isolation mode — skipping");
            messages.push({ role: "user", content: "Tool code_interpreter result: ERROR — code execution sandbox is not available in K3s isolation mode. Provide your answer based on the information available." });
            continue;
          }

          const cloudProvider = detectProviderFromToolName(toolCall.name);
          const safeArgs = sanitizeToolArgs(toolCall.arguments);
          await log("info", `[k3s-job] Calling tool: ${toolCall.name}`, { args: safeArgs });

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

        toolRounds++;
        continue;
      }

      break;
    }

    if (!output && toolRounds >= MAX_TOOL_ROUNDS) {
      await log("warn", `Max tool rounds (${MAX_TOOL_ROUNDS}) reached`);
      const finalResult = await runInK3sJob({
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

    await log("info", `Task completed in K3s sandbox — output length: ${output.length} chars`);

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

    await storage.updateTask(taskId, { status: "completed", output, completedAt: new Date() });
    taskLogEmitter.emit(`task:${taskId}`, { type: "done", status: "completed" });
  } catch (err: any) {
    const message = err?.message ?? String(err);
    await log("error", `Task failed in K3s sandbox: ${message}`);
    await storage.updateTask(taskId, { status: "failed", errorMessage: message, completedAt: new Date() });
    taskLogEmitter.emit(`task:${taskId}`, { type: "done", status: "failed" });
  } finally {
    revokeTaskToken(taskId);
  }
}

type ContainerResult =
  | { type: "result"; output: string }
  | { type: "tool_calls"; toolCalls: Array<{ id: string; name: string; arguments: Record<string, string> }>; assistantContent: string };

async function runInK3sJob(opts: {
  taskId: string;
  round: number;
  orchestrator: Orchestrator;
  agent: Agent | null;
  systemPrompt: string;
  messages: ProviderMessage[];
  tools: ReturnType<typeof buildToolList>;
  taskToken: string;
  vllmApiKey: string | null;
  log: (level: "info" | "warn" | "error", msg: string) => Promise<void>;
}): Promise<ContainerResult> {
  const { taskId, round, orchestrator, agent, systemPrompt, messages, tools, taskToken, vllmApiKey, log } = opts;

  const jobName = `nanoorch-agent-${taskId.slice(0, 8)}-r${round}`;

  const messagesB64 = Buffer.from(JSON.stringify(messages)).toString("base64");
  const toolsB64    = Buffer.from(JSON.stringify(tools)).toString("base64");

  const envEntries = [
    { name: "TASK_ID",         value: taskId },
    { name: "PROVIDER",        value: orchestrator.provider },
    { name: "MODEL",           value: orchestrator.model },
    { name: "MAX_TOKENS",      value: String(agent?.maxTokens ?? 4096) },
    { name: "TEMPERATURE",     value: String(agent?.temperature ?? 70) },
    { name: "SYSTEM_PROMPT",   value: systemPrompt },
    { name: "MESSAGES_JSON",   value: messagesB64 },
    { name: "TOOLS_JSON",      value: toolsB64 },
    { name: "OPENAI_API_KEY",          value: taskToken },
    { name: "OPENAI_BASE_URL",         value: `${K3S_PROXY_URL}/openai/v1` },
    { name: "ANTHROPIC_API_KEY",       value: taskToken },
    { name: "ANTHROPIC_BASE_URL",      value: `${K3S_PROXY_URL}/anthropic` },
    { name: "GEMINI_API_KEY",          value: taskToken },
    { name: "GEMINI_BASE_URL",         value: `${K3S_PROXY_URL}/gemini` },
    // vLLM: direct connection to the self-hosted inference server (bypasses the proxy).
    ...(orchestrator.provider === "vllm" ? [
      { name: "VLLM_API_KEY",  value: vllmApiKey || "vllm" },
      { name: "VLLM_BASE_URL", value: `${((orchestrator as any).baseUrl ?? "http://localhost:8000").replace(/\/$/, "")}/v1` },
    ] : []),
  ];

  const envYaml = envEntries
    .map((e) => `            - name: ${e.name}\n              value: ${JSON.stringify(e.value)}`)
    .join("\n");

  const manifest = `
apiVersion: batch/v1
kind: Job
metadata:
  name: ${jobName}
  namespace: ${K3S_NAMESPACE}
  labels:
    app.kubernetes.io/managed-by: nanoorch
    app.kubernetes.io/component: agent
spec:
  ttlSecondsAfterFinished: 300
  backoffLimit: 0
  template:
    metadata:
      labels:
        app: nanoorch-agent
        app.kubernetes.io/component: agent
        job-name: ${jobName}
    spec:
      restartPolicy: Never
      serviceAccountName: agent-runner
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        runAsGroup: 1000
      containers:
        - name: agent
          image: ${AGENT_IMAGE}
          imagePullPolicy: Always
          env:
${envYaml}
          resources:
            limits:
              cpu: "500m"
              memory: "512Mi"
            requests:
              cpu: "100m"
              memory: "128Mi"
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
`.trim();

  // Delete any stale job with this name before creating (Jobs are immutable
  // after creation — kubectl apply fails if the Job already exists from a
  // previous run that crashed before its finally-block cleanup could fire).
  await kubectl(["delete", "job", jobName, "-n", K3S_NAMESPACE, "--ignore-not-found"]).catch(() => {});

  try {
    await kubectl(["create", "-f", "-"], manifest);
    await log("info", `[k3s] Job ${jobName} created`);

    const podName = await waitForPodScheduled(jobName, log);
    await log("info", `[k3s] Pod ${podName} scheduled — waiting for container to start`);

    await waitForPodRunning(podName, log);
    await log("info", `[k3s] Pod ${podName} running — streaming logs`);

    return await streamJobLogs(podName, taskId, log);
  } finally {
    await kubectl(["delete", "job", jobName, "-n", K3S_NAMESPACE, "--ignore-not-found"]).catch(() => {});
  }
}

async function waitForPodScheduled(
  jobName: string,
  log: (level: "info" | "warn" | "error", msg: string) => Promise<void>,
): Promise<string> {
  const deadline = Date.now() + POD_SCHEDULE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const out = await kubectl([
      "get", "pods",
      "-l", `job-name=${jobName}`,
      "-n", K3S_NAMESPACE,
      "-o", "jsonpath={.items[0].metadata.name}",
    ]).catch(() => "");

    const name = out.trim();
    if (name) return name;

    await new Promise((r) => setTimeout(r, 2000));
  }

  throw new Error(`K3s pod for job ${jobName} was not scheduled within ${POD_SCHEDULE_TIMEOUT_MS / 1000}s`);
}

async function waitForPodRunning(
  podName: string,
  log: (level: "info" | "warn" | "error", msg: string) => Promise<void>,
): Promise<void> {
  const deadline = Date.now() + POD_SCHEDULE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const phaseOut = await kubectl([
      "get", "pod", podName,
      "-n", K3S_NAMESPACE,
      "-o", "jsonpath={.status.phase}",
    ]).catch(() => "");

    const phase = phaseOut.trim();

    if (phase === "Running" || phase === "Succeeded" || phase === "Failed") return;

    if (phase === "Pending") {
      // Check for image pull errors specifically
      const reasonOut = await kubectl([
        "get", "pod", podName,
        "-n", K3S_NAMESPACE,
        "-o", "jsonpath={.status.containerStatuses[0].state.waiting.reason}",
      ]).catch(() => "");

      const reason = reasonOut.trim();
      if (reason === "ImagePullBackOff" || reason === "ErrImagePull") {
        const msgOut = await kubectl([
          "get", "pod", podName,
          "-n", K3S_NAMESPACE,
          "-o", "jsonpath={.status.containerStatuses[0].state.waiting.message}",
        ]).catch(() => "");
        throw new Error(`K3s pod image pull failed (${reason}): ${msgOut.trim() || "registry:5000/nanoorch-agent:latest not found — build and push the agent image first"}`);
      }

      if (reason) await log("info", `[k3s] Pod ${podName} waiting: ${reason}`);
    }

    await new Promise((r) => setTimeout(r, 3000));
  }

  throw new Error(`K3s pod ${podName} did not reach Running state within ${POD_SCHEDULE_TIMEOUT_MS / 1000}s`);
}

function streamJobLogs(
  podName: string,
  taskId: string,
  log: (level: "info" | "warn" | "error", msg: string) => Promise<void>,
): Promise<ContainerResult> {
  return new Promise((resolve, reject) => {
    const args = kubectlArgs([
      "logs", "--follow",
      "--pod-running-timeout", `${Math.ceil(POD_SCHEDULE_TIMEOUT_MS / 1000)}s`,
      podName,
      "-n", K3S_NAMESPACE,
    ]);

    const proc = spawn("kubectl", args, { stdio: ["ignore", "pipe", "pipe"] });

    const rl = readline.createInterface({ input: proc.stdout! });
    let result: ContainerResult | null = null;
    let timedOut = false;

    const timer = setTimeout(async () => {
      timedOut = true;
      proc.kill("SIGKILL");
      await log("error", `K3s pod ${podName} timed out after ${JOB_TIMEOUT_MS / 1000}s`);
      reject(new Error("K3s pod timed out"));
    }, JOB_TIMEOUT_MS);

    rl.on("line", async (line) => {
      line = line.trim();
      if (!line) return;
      try {
        const parsed = JSON.parse(line);

        if (parsed.type === "log") {
          await log(parsed.level ?? "info", `[k3s-pod] ${parsed.message}`);
        } else if (parsed.type === "token") {
          // Relay streaming tokens to the SSE endpoint — not persisted to DB.
          taskLogEmitter.emit(`task:${taskId}:token`, parsed.content ?? "");
        } else if (parsed.type === "result") {
          result = { type: "result", output: parsed.output ?? "" };
        } else if (parsed.type === "tool_calls") {
          result = {
            type: "tool_calls",
            toolCalls: parsed.toolCalls ?? [],
            assistantContent: parsed.assistantContent ?? "",
          };
        } else if (parsed.type === "error") {
          reject(new Error(parsed.message ?? "K3s pod error"));
        }
      } catch {
        await log("warn", `[k3s-pod] non-JSON output: ${line.slice(0, 200)}`);
      }
    });

    proc.stderr!.on("data", async (data: Buffer) => {
      const text = data.toString().trim();
      if (text) await log("warn", `[k3s-pod stderr] ${text.slice(0, 500)}`);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return;
      if (result) {
        resolve(result);
      } else if (code !== 0) {
        reject(new Error(`K3s pod exited with code ${code}`));
      } else {
        reject(new Error("K3s pod exited without producing output"));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to stream K3s pod logs: ${err.message}`));
    });
  });
}

function kubectlArgs(args: string[]): string[] {
  return KUBECONFIG_PATH ? ["--kubeconfig", KUBECONFIG_PATH, ...args] : args;
}

function kubectl(args: string[], stdin?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("kubectl", kubectlArgs(args), { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    if (stdin) {
      proc.stdin.write(stdin);
      proc.stdin.end();
    } else {
      proc.stdin.end();
    }

    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.stderr.on("data", (d: Buffer) => errChunks.push(d));

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks).toString());
      } else {
        const stderr = Buffer.concat(errChunks).toString().slice(0, 500);
        reject(new Error(`kubectl ${args[0]} failed (exit ${code}): ${stderr}`));
      }
    });

    proc.on("error", (err) => reject(new Error(`kubectl spawn error: ${err.message}`)));
  });
}
