import OpenAI from "openai";
import { loadSecret } from "../lib/secrets";
import type { RunAgentOptions, RunAgentResult, ToolCall } from "./index";

function getClient(apiKey?: string | null, baseUrl?: string | null) {
  return new OpenAI({
    apiKey: apiKey ?? loadSecret("AI_INTEGRATIONS_OPENAI_API_KEY"),
    baseURL: baseUrl ?? process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

export async function runOpenAI(options: RunAgentOptions): Promise<RunAgentResult> {
  const openai = getClient(options.apiKey, options.baseUrl);
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  if (options.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }

  for (const msg of options.messages) {
    if (msg.role === "system") continue;
    messages.push({ role: msg.role, content: msg.content });
  }

  const tools: OpenAI.Chat.ChatCompletionTool[] | undefined =
    options.tools && options.tools.length > 0
      ? options.tools.map((t) => ({
          type: "function" as const,
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }))
      : undefined;

  if (tools && tools.length > 0) {
    const res = await openai.chat.completions.create({
      model: options.model,
      messages,
      tools,
      tool_choice: "auto",
      max_completion_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature !== undefined ? options.temperature / 100 : 0.7,
    });

    const choice = res.choices[0];
    const toolCalls: ToolCall[] = (choice.message.tool_calls ?? []).map((tc) => {
      const fn = (tc as unknown as { function: { name: string; arguments: string } }).function;
      return { id: tc.id, name: fn.name, arguments: JSON.parse(fn.arguments || "{}") };
    });

    return {
      content: choice.message.content ?? "",
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: res.usage
        ? { inputTokens: res.usage.prompt_tokens, outputTokens: res.usage.completion_tokens }
        : undefined,
    };
  }

  const stream = await openai.chat.completions.create({
    model: options.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    max_completion_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature !== undefined ? options.temperature / 100 : 0.7,
  });

  let fullResponse = "";
  let inputTokens = 0;
  let outputTokens = 0;
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content ?? "";
    if (content) {
      fullResponse += content;
      options.onChunk?.(content);
    }
    if (chunk.usage) {
      inputTokens = chunk.usage.prompt_tokens;
      outputTokens = chunk.usage.completion_tokens;
    }
  }
  return {
    content: fullResponse,
    usage: inputTokens > 0 ? { inputTokens, outputTokens } : undefined,
  };
}
