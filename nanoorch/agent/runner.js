/**
 * NanoOrch Agent Sandbox Runner
 *
 * Runs inside an ephemeral Docker container. Receives task configuration
 * via environment variables, executes ONE round of AI inference with
 * streaming token output, and emits structured JSON to stdout.
 *
 * Outputs one or more of:
 *   { type: "log",        level, message }         — progress line
 *   { type: "token",      content }                 — streaming LLM token
 *   { type: "tool_calls", toolCalls, assistantContent } — AI wants tools
 *   { type: "result",     output }                 — final answer
 *   { type: "error",      message }                — fatal error
 */

const {
  TASK_ID = "unknown",
  PROVIDER = "openai",
  MODEL = "gpt-4o",
  SYSTEM_PROMPT = "",
  MAX_TOKENS = "4096",
  TEMPERATURE = "70",
  MESSAGES_JSON,
  TOOLS_JSON,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
  ANTHROPIC_API_KEY,
  ANTHROPIC_BASE_URL,
  GEMINI_API_KEY,
  GEMINI_BASE_URL,
  VLLM_API_KEY,
  VLLM_BASE_URL,
} = process.env;

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function log(level, message) {
  emit({ type: "log", level, message, timestamp: new Date().toISOString() });
}

function decodeB64Json(b64, fallback) {
  if (!b64) return fallback;
  try {
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch {
    return fallback;
  }
}

const messages = decodeB64Json(MESSAGES_JSON, []);
const tools = decodeB64Json(TOOLS_JSON, []);
const maxTokens = parseInt(MAX_TOKENS);
const temperature = parseInt(TEMPERATURE) / 100;

// ── OpenAI streaming ──────────────────────────────────────────────────────────
async function runOpenAI() {
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
    baseURL: OPENAI_BASE_URL || undefined,
  });

  const chatMessages = [];
  if (SYSTEM_PROMPT) chatMessages.push({ role: "system", content: SYSTEM_PROMPT });
  chatMessages.push(...messages);

  const params = {
    model: MODEL,
    messages: chatMessages,
    max_completion_tokens: maxTokens,
    temperature,
    stream: true,
  };

  if (tools.length > 0) {
    params.tools = tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    params.tool_choice = "auto";
  }

  log("info", `Calling OpenAI ${MODEL} (streaming)`);
  const stream = await openai.chat.completions.create(params);

  let fullText = "";
  const toolCallsMap = {};

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (!delta) continue;

    if (delta.content) {
      fullText += delta.content;
      emit({ type: "token", content: delta.content });
    }

    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        if (!toolCallsMap[idx]) toolCallsMap[idx] = { id: "", name: "", argsStr: "" };
        if (tc.id) toolCallsMap[idx].id = tc.id;
        if (tc.function?.name) toolCallsMap[idx].name = tc.function.name;
        if (tc.function?.arguments) toolCallsMap[idx].argsStr += tc.function.arguments;
      }
    }
  }

  const toolCallsArr = Object.values(toolCallsMap);
  if (toolCallsArr.length > 0) {
    const toolCalls = toolCallsArr.map((tc) => ({
      id: tc.id,
      name: tc.name,
      arguments: (() => { try { return JSON.parse(tc.argsStr); } catch { return {}; } })(),
    }));
    emit({ type: "tool_calls", toolCalls, assistantContent: fullText });
  } else {
    emit({ type: "result", output: fullText });
  }
}

// ── Anthropic streaming ───────────────────────────────────────────────────────
async function runAnthropic() {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const anthropic = new Anthropic({
    apiKey: ANTHROPIC_API_KEY,
    baseURL: ANTHROPIC_BASE_URL || undefined,
  });

  const chatMessages = messages.filter((m) => m.role !== "system");

  const params = {
    model: MODEL,
    max_tokens: maxTokens,
    temperature,
    system: SYSTEM_PROMPT || undefined,
    messages: chatMessages,
  };

  if (tools.length > 0) {
    params.tools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  log("info", `Calling Anthropic ${MODEL} (streaming)`);

  let fullText = "";
  const stream = anthropic.messages.stream(params);

  stream.on("text", (text) => {
    fullText += text;
    emit({ type: "token", content: text });
  });

  const response = await stream.finalMessage();

  const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");

  if (toolUseBlocks.length > 0) {
    const toolCalls = toolUseBlocks.map((b) => ({
      id: b.id,
      name: b.name,
      arguments: b.input ?? {},
    }));
    emit({ type: "tool_calls", toolCalls, assistantContent: fullText });
  } else {
    emit({ type: "result", output: fullText });
  }
}

// ── Gemini streaming ──────────────────────────────────────────────────────────
async function runGemini() {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({
    apiKey: GEMINI_API_KEY,
    httpOptions: {
      apiVersion: "",
      baseUrl: GEMINI_BASE_URL || undefined,
    },
  });

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const params = {
    model: MODEL,
    contents,
    config: {
      maxOutputTokens: maxTokens,
      temperature,
      systemInstruction: SYSTEM_PROMPT ? { parts: [{ text: SYSTEM_PROMPT }] } : undefined,
    },
  };

  if (tools.length > 0) {
    params.config.tools = [{
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    }];
  }

  log("info", `Calling Gemini ${MODEL} (streaming)`);

  let fullText = "";
  const functionCallParts = [];

  const stream = await ai.models.generateContentStream(params);

  for await (const chunk of stream) {
    const parts = chunk.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.text) {
        fullText += part.text;
        emit({ type: "token", content: part.text });
      }
      if (part.functionCall) {
        functionCallParts.push(part);
      }
    }
  }

  if (functionCallParts.length > 0) {
    const toolCalls = functionCallParts.map((p, i) => ({
      id: `gemini-call-${i}`,
      name: p.functionCall.name,
      arguments: p.functionCall.args ?? {},
    }));
    emit({ type: "tool_calls", toolCalls, assistantContent: fullText });
  } else {
    emit({ type: "result", output: fullText });
  }
}

// ── vLLM streaming (OpenAI-compatible) ───────────────────────────────────────
async function runVllm() {
  if (!VLLM_BASE_URL) throw new Error("vLLM requires VLLM_BASE_URL (e.g. http://localhost:8000/v1)");

  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({
    apiKey: VLLM_API_KEY || "vllm",
    baseURL: VLLM_BASE_URL,
  });

  const chatMessages = [];
  if (SYSTEM_PROMPT) chatMessages.push({ role: "system", content: SYSTEM_PROMPT });
  chatMessages.push(...messages);

  const baseParams = {
    model: MODEL,
    messages: chatMessages,
    max_tokens: maxTokens,
    temperature,
    stream: true,
  };

  log("info", `Calling vLLM ${MODEL} (streaming)`);

  let fullText = "";
  const toolCallsMap = {};

  if (tools.length > 0) {
    const stream = await openai.chat.completions.create({
      ...baseParams,
      tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
      tool_choice: "auto",
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;
      if (delta.content) {
        fullText += delta.content;
        emit({ type: "token", content: delta.content });
      }
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!toolCallsMap[idx]) toolCallsMap[idx] = { id: "", name: "", argsStr: "" };
          if (tc.id) toolCallsMap[idx].id = tc.id;
          if (tc.function?.name) toolCallsMap[idx].name = tc.function.name;
          if (tc.function?.arguments) toolCallsMap[idx].argsStr += tc.function.arguments;
        }
      }
    }

    const toolCallsArr = Object.values(toolCallsMap);
    if (toolCallsArr.length > 0) {
      const toolCalls = toolCallsArr.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: (() => { try { return JSON.parse(tc.argsStr); } catch { return {}; } })(),
      }));
      emit({ type: "tool_calls", toolCalls, assistantContent: fullText });
    } else {
      emit({ type: "result", output: fullText });
    }
  } else {
    const stream = await openai.chat.completions.create(baseParams);
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        fullText += delta.content;
        emit({ type: "token", content: delta.content });
      }
    }
    emit({ type: "result", output: fullText });
  }
}

async function main() {
  log("info", `Agent sandbox started — task: ${TASK_ID}, provider: ${PROVIDER}, tools: ${tools.length}`);

  switch (PROVIDER) {
    case "openai":    await runOpenAI();    break;
    case "anthropic": await runAnthropic(); break;
    case "gemini":    await runGemini();    break;
    case "vllm":      await runVllm();      break;
    default: throw new Error(`Unknown provider: ${PROVIDER}`);
  }
}

main().catch((err) => {
  emit({ type: "error", message: err?.message ?? String(err) });
  process.exit(1);
});
