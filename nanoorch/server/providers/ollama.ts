import OpenAI from "openai";
import type { RunAgentOptions, RunAgentResult, ToolCall } from "./index";

function getClient(baseUrl: string) {
  return new OpenAI({
    apiKey: "ollama",
    baseURL: baseUrl.replace(/\/$/, "") + "/v1",
  });
}

export async function runOllama(options: RunAgentOptions): Promise<RunAgentResult> {
  if (!options.baseUrl) throw new Error("Ollama requires a base URL (e.g. http://localhost:11434)");

  const client = getClient(options.baseUrl);
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
    const res = await client.chat.completions.create({
      model: options.model,
      messages,
      tools,
      tool_choice: "auto",
      max_tokens: options.maxTokens ?? 4096,
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
    };
  }

  const stream = await client.chat.completions.create({
    model: options.model,
    messages,
    stream: true,
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature !== undefined ? options.temperature / 100 : 0.7,
  });

  let fullResponse = "";
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content ?? "";
    if (content) {
      fullResponse += content;
      options.onChunk?.(content);
    }
  }
  return { content: fullResponse };
}
