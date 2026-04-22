import { loadSecret } from "./secrets";

export const EMBEDDING_DIM = 1536;

const OPENAI_EMBED_MODEL = "text-embedding-3-small";
const GEMINI_EMBED_MODEL = "text-embedding-004";

/**
 * Generate a 1536-dim embedding vector for the given text.
 *
 * Provider priority:
 *   1. OpenAI  (text-embedding-3-small → naturally 1536 dims)
 *   2. Gemini  (text-embedding-004 with outputDimensionality=1536)
 *   3. null    (graceful skip — caller must handle)
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const input = text.slice(0, 8000);

  const openaiKey = loadSecret("AI_INTEGRATIONS_OPENAI_API_KEY");
  if (openaiKey) {
    try {
      const base = (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com").replace(/\/$/, "");
      const res = await fetch(`${base}/v1/embeddings`, {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: OPENAI_EMBED_MODEL, input }),
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        const emb: unknown = data?.data?.[0]?.embedding;
        if (Array.isArray(emb) && emb.length === EMBEDDING_DIM) return emb as number[];
      }
    } catch {
    }
  }

  const geminiKey = loadSecret("AI_INTEGRATIONS_GEMINI_API_KEY");
  if (geminiKey) {
    try {
      const base = (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com").replace(/\/$/, "");
      const res = await fetch(
        `${base}/v1beta/models/${GEMINI_EMBED_MODEL}:embedContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: `models/${GEMINI_EMBED_MODEL}`,
            content: { parts: [{ text: input }] },
            outputDimensionality: EMBEDDING_DIM,
          }),
        }
      );
      if (res.ok) {
        const data = (await res.json()) as any;
        const emb: unknown = data?.embedding?.values;
        if (Array.isArray(emb) && emb.length === EMBEDDING_DIM) return emb as number[];
      }
    } catch {
    }
  }

  return null;
}
