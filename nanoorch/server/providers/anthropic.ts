import Anthropic from "@anthropic-ai/sdk";
import { loadSecret } from "../lib/secrets";
import type { RunAgentOptions, RunAgentResult, ToolCall } from "./index";

function getClient(apiKey?: string | null, baseUrl?: string | null) {
  return new Anthropic({
    apiKey: apiKey ?? loadSecret("AI_INTEGRATIONS_ANTHROPIC_API_KEY"),
    baseURL: baseUrl ?? process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  });
}

export async function runAnthropic(options: RunAgentOptions): Promise<RunAgentResult> {
  const anthropic = getClient(options.apiKey, options.baseUrl);
  const messages: Anthropic.MessageParam[] = options.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const tools: Anthropic.Tool[] | undefined =
    options.tools && options.tools.length > 0
      ? options.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters as Anthropic.Tool["input_schema"],
        }))
      : undefined;

  if (tools && tools.length > 0) {
    const res = await anthropic.messages.create({
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      system: options.systemPrompt ?? undefined,
      messages,
      tools,
      tool_choice: { type: "auto" },
      temperature: options.temperature !== undefined ? options.temperature / 100 : 0.7,
    });

    const toolCalls: ToolCall[] = res.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, arguments: b.input as Record<string, string> }));

    const textContent = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    return {
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
    };
  }

  const stream = anthropic.messages.stream({
    model: options.model,
    max_tokens: options.maxTokens ?? 4096,
    system: options.systemPrompt ?? undefined,
    messages,
    temperature: options.temperature !== undefined ? options.temperature / 100 : 0.7,
  });

  let fullResponse = "";
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      const text = event.delta.text;
      fullResponse += text;
      options.onChunk?.(text);
    }
  }
  const finalMsg = await stream.finalMessage();
  return {
    content: fullResponse,
    usage: { inputTokens: finalMsg.usage.input_tokens, outputTokens: finalMsg.usage.output_tokens },
  };
}
