import { GoogleGenAI } from "@google/genai";
import { loadSecret } from "../lib/secrets";
import type { RunAgentOptions, RunAgentResult, ToolCall } from "./index";

function getClient(apiKey?: string | null, baseUrl?: string | null) {
  return new GoogleGenAI({
    apiKey: apiKey ?? loadSecret("AI_INTEGRATIONS_GEMINI_API_KEY"),
    httpOptions: {
      apiVersion: "",
      baseUrl: baseUrl ?? process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
    },
  });
}

export async function runGemini(options: RunAgentOptions): Promise<RunAgentResult> {
  const ai = getClient(options.apiKey, options.baseUrl);
  const contents = options.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const systemInstruction = options.systemPrompt
    ? { parts: [{ text: options.systemPrompt }] }
    : undefined;

  const tools =
    options.tools && options.tools.length > 0
      ? ([{ functionDeclarations: options.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }] as any)
      : undefined;

  if (tools && tools.length > 0) {
    const res = await ai.models.generateContent({
      model: options.model,
      contents,
      config: {
        maxOutputTokens: options.maxTokens ?? 4096,
        temperature: options.temperature !== undefined ? options.temperature / 100 : 0.7,
        systemInstruction,
        tools,
      },
    });

    const candidate = res.candidates?.[0];
    const toolCalls: ToolCall[] = [];
    let text = "";

    for (const part of candidate?.content?.parts ?? []) {
      if (part.functionCall) {
        toolCalls.push({
          id: part.functionCall.name ?? "call",
          name: part.functionCall.name ?? "",
          arguments: (part.functionCall.args ?? {}) as Record<string, string>,
        });
      } else if (part.text) {
        text += part.text;
      }
    }

    return {
      content: text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: res.usageMetadata
        ? { inputTokens: res.usageMetadata.promptTokenCount ?? 0, outputTokens: res.usageMetadata.candidatesTokenCount ?? 0 }
        : undefined,
    };
  }

  const stream = await ai.models.generateContentStream({
    model: options.model,
    contents,
    config: {
      maxOutputTokens: options.maxTokens ?? 4096,
      temperature: options.temperature !== undefined ? options.temperature / 100 : 0.7,
      systemInstruction,
    },
  });

  let fullResponse = "";
  let inputTokens = 0;
  let outputTokens = 0;
  for await (const chunk of stream) {
    const text = chunk.text ?? "";
    if (text) {
      fullResponse += text;
      options.onChunk?.(text);
    }
    if (chunk.usageMetadata) {
      inputTokens = chunk.usageMetadata.promptTokenCount ?? 0;
      outputTokens = chunk.usageMetadata.candidatesTokenCount ?? 0;
    }
  }
  return {
    content: fullResponse,
    usage: inputTokens > 0 ? { inputTokens, outputTokens } : undefined,
  };
}
