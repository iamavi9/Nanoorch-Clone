export function estimateTokenCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing: Record<string, { input: number; output: number }> = {
    "openai:gpt-5.4":                       { input: 2.50,  output: 15.00 },
    "openai:gpt-5.4-mini":                  { input: 0.75,  output:  4.50 },
    "openai:gpt-5.4-nano":                  { input: 0.15,  output:  0.60 },
    "anthropic:claude-opus-4-6":            { input: 15.00, output: 75.00 },
    "anthropic:claude-sonnet-4-6":          { input: 3.00,  output: 15.00 },
    "anthropic:claude-haiku-4-5-20251001":  { input: 0.25,  output:  1.25 },
    "gemini:gemini-3.1-pro-preview":        { input: 1.25,  output: 10.00 },
    "gemini:gemini-3-flash-preview":        { input: 0.10,  output:  0.40 },
    "gemini:gemini-3.1-flash-lite-preview": { input: 0.04,  output:  0.15 },
    "gemini:gemini-2.5-pro":                { input: 1.25,  output:  5.00 },
    "gemini:gemini-2.5-flash":              { input: 0.075, output:  0.30 },
  };
  if (provider === "ollama" || provider === "vllm") return 0;
  const rates = pricing[`${provider}:${model}`] ?? { input: 1.00, output: 3.00 };
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}
