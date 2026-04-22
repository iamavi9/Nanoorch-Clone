export type Provider = "openai" | "anthropic" | "gemini" | "ollama" | "vllm";

export interface ProviderMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, string>;
}

export interface RunAgentOptions {
  provider: Provider;
  model: string;
  baseUrl?: string | null;
  apiKey?: string | null;
  systemPrompt?: string | null;
  messages: ProviderMessage[];
  maxTokens?: number;
  temperature?: number;
  tools?: ToolDefinition[];
  onChunk?: (chunk: string) => void;
}

export interface RunAgentResult {
  content: string;
  toolCalls?: ToolCall[];
  usage?: { inputTokens: number; outputTokens: number };
}

export interface ProviderModelInfo {
  id: string;
  name: string;
  description: string;
}

export const PROVIDER_MODELS: Record<Provider, ProviderModelInfo[]> = {
  openai: [
    { id: "gpt-5.4", name: "GPT-5.4", description: "Flagship model for complex reasoning and agentic workflows" },
    { id: "gpt-5.4-mini", name: "GPT-5.4 Mini", description: "Strongest mini model for coding and subagents" },
    { id: "gpt-5.4-nano", name: "GPT-5.4 Nano", description: "Lowest latency and cost variant" },
  ],
  anthropic: [
    { id: "claude-opus-4-6", name: "Claude Opus 4.6", description: "Most capable Claude model" },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", description: "Balanced performance" },
    { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", description: "Fast and lightweight" },
  ],
  gemini: [
    { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro (Preview)", description: "Advanced intelligence, complex problem-solving and agentic capabilities" },
    { id: "gemini-3-flash-preview", name: "Gemini 3 Flash (Preview)", description: "Frontier-class performance at a fraction of the cost" },
    { id: "gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash-Lite (Preview)", description: "Lightweight frontier-class performance, lowest cost" },
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", description: "Most capable stable Gemini model" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "Fast and efficient stable model" },
  ],
  ollama: [
    { id: "llama3.1", name: "Llama 3.1", description: "Meta's Llama 3.1 (tool calling supported)" },
    { id: "llama3.2", name: "Llama 3.2", description: "Meta's Llama 3.2" },
    { id: "qwen2.5", name: "Qwen 2.5", description: "Alibaba Qwen 2.5 (tool calling supported)" },
    { id: "mistral", name: "Mistral", description: "Mistral 7B" },
    { id: "codellama", name: "Code Llama", description: "Code-focused Llama model" },
    { id: "deepseek-r1", name: "DeepSeek R1", description: "DeepSeek reasoning model" },
  ],
  vllm: [
    { id: "meta-llama/Llama-3.1-70B-Instruct", name: "Llama 3.1 70B Instruct", description: "Meta's Llama 3.1 70B — strong reasoning & tool calling" },
    { id: "meta-llama/Llama-3.1-8B-Instruct", name: "Llama 3.1 8B Instruct", description: "Meta's Llama 3.1 8B — fast, lightweight" },
    { id: "Qwen/Qwen2.5-72B-Instruct", name: "Qwen 2.5 72B Instruct", description: "Alibaba Qwen 2.5 72B — strong coding & tool calling" },
    { id: "Qwen/Qwen2.5-7B-Instruct", name: "Qwen 2.5 7B Instruct", description: "Alibaba Qwen 2.5 7B — efficient" },
    { id: "mistralai/Mixtral-8x7B-Instruct-v0.1", name: "Mixtral 8x7B Instruct", description: "Mistral MoE model — high throughput" },
    { id: "mistralai/Mistral-Large-Instruct-2407", name: "Mistral Large Instruct", description: "Mistral's flagship model" },
    { id: "deepseek-ai/DeepSeek-V3", name: "DeepSeek V3", description: "DeepSeek V3 — strong reasoning" },
    { id: "microsoft/Phi-4", name: "Phi-4", description: "Microsoft Phi-4 — compact, high capability" },
  ],
};

export async function runAgent(options: RunAgentOptions): Promise<RunAgentResult> {
  switch (options.provider) {
    case "openai": {
      const { runOpenAI } = await import("./openai");
      return runOpenAI(options);
    }
    case "anthropic": {
      const { runAnthropic } = await import("./anthropic");
      return runAnthropic(options);
    }
    case "gemini": {
      const { runGemini } = await import("./gemini");
      return runGemini(options);
    }
    case "ollama": {
      const { runOllama } = await import("./ollama");
      return runOllama(options);
    }
    case "vllm": {
      const { runVllm } = await import("./vllm");
      return runVllm(options);
    }
    default:
      throw new Error(`Unknown provider: ${options.provider}`);
  }
}
