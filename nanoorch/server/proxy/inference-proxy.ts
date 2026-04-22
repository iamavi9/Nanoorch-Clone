/**
 * Inference Proxy — strips real AI API keys from agent containers.
 *
 * Agent containers receive a short-lived task token instead of real API keys.
 * Every call they make hits /internal/proxy/:provider/* here.  The proxy:
 *   1. Verifies the task token (in-memory, no DB round-trip).
 *   2. Strips the incoming Authorization / x-api-key header.
 *   3. Injects the real provider key (from server env-vars).
 *   4. Pipes the full request + streaming response through to the provider.
 *
 * This means real API keys are never visible inside agent containers and
 * cannot be exposed via `docker inspect`.
 */

import { Router, type Request, type Response } from "express";
import https from "node:https";
import http from "node:http";
import { randomBytes } from "crypto";
import { loadSecret } from "../lib/secrets";
import { assertSafeUrl } from "../lib/ssrf-guard";

// ── Token store ──────────────────────────────────────────────────────────────

const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes (covers long-running tasks)

interface TokenEntry {
  taskId: string;
  expiresAt: number;
}

// ── Per-task token-usage accumulator ─────────────────────────────────────────
// Each call the agent container makes goes through this proxy.  For non-streaming
// JSON responses we buffer the body and extract the provider's usage fields so
// Docker / K3s executors can record token usage in the database at task completion.

interface ProxiedUsage { inputTokens: number; outputTokens: number; }
const taskProxiedUsage = new Map<string, ProxiedUsage>();

/** Retrieve (and remove) accumulated token usage for a completed task. */
export function getAndClearProxiedUsage(taskId: string): ProxiedUsage | null {
  const u = taskProxiedUsage.get(taskId);
  taskProxiedUsage.delete(taskId);
  return u ?? null;
}

function accumulateProxiedUsage(taskId: string, inp: number, out: number): void {
  const cur = taskProxiedUsage.get(taskId) ?? { inputTokens: 0, outputTokens: 0 };
  taskProxiedUsage.set(taskId, {
    inputTokens: cur.inputTokens + inp,
    outputTokens: cur.outputTokens + out,
  });
}

function parseUsageTokens(
  provider: string,
  body: string,
): { inputTokens: number; outputTokens: number } | null {
  try {
    const j = JSON.parse(body);
    if (provider === "openai") {
      const u = j?.usage;
      if (u) return { inputTokens: u.prompt_tokens ?? 0, outputTokens: u.completion_tokens ?? 0 };
    } else if (provider === "anthropic") {
      const u = j?.usage;
      if (u) return { inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0 };
    } else if (provider === "gemini") {
      const u = j?.usageMetadata;
      if (u) return { inputTokens: u.promptTokenCount ?? 0, outputTokens: u.candidatesTokenCount ?? 0 };
    }
    return null;
  } catch { return null; }
}

const byToken = new Map<string, TokenEntry>();
const byTask  = new Map<string, string>(); // taskId → token

/** Issue a short-lived proxy token for a task.  Call once before spawning the agent container. */
export function issueTaskToken(taskId: string): string {
  revokeTaskToken(taskId); // ensure no stale entry
  const token      = randomBytes(32).toString("hex");
  const expiresAt  = Date.now() + TOKEN_TTL_MS;
  byToken.set(token, { taskId, expiresAt });
  byTask.set(taskId, token);
  return token;
}

/** Revoke the proxy token for a task.  Call in the finally block after the task completes. */
export function revokeTaskToken(taskId: string): void {
  const token = byTask.get(taskId);
  if (token) {
    byToken.delete(token);
    byTask.delete(taskId);
  }
}

function isValidToken(incoming: string): boolean {
  const entry = byToken.get(incoming);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    byToken.delete(incoming);
    byTask.delete(entry.taskId);
    return false;
  }
  return true;
}

// Periodic cleanup of expired tokens (runs every 5 minutes)
setInterval(() => {
  const now = Date.now();
  byToken.forEach((entry, token) => {
    if (now > entry.expiresAt) {
      byToken.delete(token);
      byTask.delete(entry.taskId);
    }
  });
}, 5 * 60 * 1000).unref();

// ── Provider config ──────────────────────────────────────────────────────────

type AuthScheme = "bearer" | "x-api-key";

interface ProviderConfig {
  realBaseUrl: () => string;
  authScheme: AuthScheme;
  secretName: string;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  openai: {
    realBaseUrl: () => {
      const raw = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com";
      // The docker-executor encodes /v1 in the proxy URL it passes to agent containers
      // (e.g. OPENAI_BASE_URL=${proxyBase}/openai/v1), so pathSuffix already starts with
      // "v1/chat/completions".  If the configured base URL also contains a trailing /v1
      // (the docker-compose.yml default is https://api.openai.com/v1), the proxy would
      // build "/v1" + "/v1/chat/completions" = "/v1/v1/chat/completions" → 404.
      // Strip any trailing version segment to prevent that duplication.
      // Examples:
      //   https://api.openai.com/v1   → https://api.openai.com
      //   https://api.openai.com      → https://api.openai.com  (no-op)
      //   https://my.server.com/api/v1 → https://my.server.com/api
      return raw.replace(/\/v\d+(\.\d+)?\/?$/, "").replace(/\/$/, "");
    },
    authScheme: "bearer",
    secretName: "AI_INTEGRATIONS_OPENAI_API_KEY",
  },
  anthropic: {
    realBaseUrl: () =>
      process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL ?? "https://api.anthropic.com",
    authScheme: "x-api-key",
    secretName: "AI_INTEGRATIONS_ANTHROPIC_API_KEY",
  },
  gemini: {
    realBaseUrl: () =>
      process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ??
      "https://generativelanguage.googleapis.com",
    authScheme: "bearer",
    secretName: "AI_INTEGRATIONS_GEMINI_API_KEY",
  },
};

// ── Router ───────────────────────────────────────────────────────────────────

export function createInferenceProxyRouter(): Router {
  const router = Router();

  // Match  /internal/proxy/:provider/<anything>
  // Use router.use so req.path contains the remainder after /:provider —
  // this is the most reliable cross-Express-version catch-all pattern.
  router.use("/:provider", (req: Request, res: Response) => {
    const provider = req.params["provider"] as string;
    const cfg = PROVIDERS[provider];
    if (!cfg) {
      res.status(404).json({ error: `Unknown provider: ${provider}` });
      return;
    }

    // ── 1. Verify task token ─────────────────────────────────────────────────
    let incoming: string | null = null;
    const authHdr    = req.headers["authorization"];
    const apiKeyHdr  = req.headers["x-api-key"];

    if (typeof authHdr === "string" && authHdr.startsWith("Bearer ")) {
      incoming = authHdr.slice(7).trim();
    } else if (typeof apiKeyHdr === "string") {
      incoming = apiKeyHdr.trim();
    }

    if (!incoming || !isValidToken(incoming)) {
      res.status(401).json({ error: "Invalid or expired task token" });
      return;
    }

    // Capture taskId now (before the async proxy response) so we can attribute usage.
    const taskId = byToken.get(incoming)?.taskId ?? null;

    // ── 2. Resolve real key ──────────────────────────────────────────────────
    const realKey = loadSecret(cfg.secretName);
    if (!realKey) {
      res.status(503).json({ error: `Provider '${provider}' is not configured on this server` });
      return;
    }

    // ── 3. Build target URL ──────────────────────────────────────────────────
    // req.path is the remainder after /:provider (e.g. /v1/chat/completions).
    // Strip the leading slash so pathSuffix = "v1/chat/completions".
    // Strip control characters from the path/query to prevent header injection.
    const pathSuffix = req.path.replace(/^\//, "").replace(/[\x00-\x1f\x7f]/g, "");
    const baseUrl    = cfg.realBaseUrl().replace(/\/$/, "");
    try { assertSafeUrl(baseUrl); } catch {
      res.status(502).json({ error: "Provider base URL is not permitted." });
      return;
    }
    let   targetPath = `/${pathSuffix}`;

    // Preserve query string (strip control characters)
    const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")).replace(/[\x00-\x1f\x7f]/g, "") : "";
    if (qs) targetPath += qs;

    const targetBase = new URL(baseUrl);
    const isHttps    = targetBase.protocol === "https:";
    const transport  = isHttps ? https : http;
    const port       = parseInt(targetBase.port || (isHttps ? "443" : "80"), 10);

    // ── 4. Build forwarded headers ───────────────────────────────────────────
    // Strip headers that must not be forwarded, plus accept-encoding so the
    // upstream always returns an uncompressed JSON body.  The proxy must be
    // able to parse the response for usage accounting; a gzip/br body would
    // cause JSON.parse to fail silently and lose token counts.
    const STRIP = new Set(["host", "authorization", "x-api-key", "content-length", "accept-encoding"]);
    const fwdHeaders: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (STRIP.has(k.toLowerCase())) continue;
      if (v !== undefined) fwdHeaders[k] = v as string | string[];
    }

    if (cfg.authScheme === "bearer") {
      fwdHeaders["authorization"] = `Bearer ${realKey}`;
    } else {
      fwdHeaders["x-api-key"] = realKey;
    }

    // ── 5. Serialize request body (JSON) ─────────────────────────────────────
    const hasBody = !["GET", "HEAD"].includes(req.method) &&
                    req.body && Object.keys(req.body).length > 0;
    const bodyBuf = hasBody ? Buffer.from(JSON.stringify(req.body), "utf-8") : null;

    if (bodyBuf) {
      fwdHeaders["content-type"]   = "application/json";
      fwdHeaders["content-length"] = String(bodyBuf.byteLength);
    }

    // ── 6. Proxy the request, pipe streaming response ────────────────────────
    const options: https.RequestOptions = {
      hostname: targetBase.hostname,
      port,
      path:     targetBase.pathname.replace(/\/$/, "") + targetPath,
      method:   req.method,
      headers:  fwdHeaders,
    };

    const proxyReq = transport.request(options, (proxyRes) => {
      const status   = proxyRes.statusCode ?? 502;
      const ct       = (proxyRes.headers["content-type"] ?? "").toLowerCase();
      const isStream = ct.includes("text/event-stream") || ct.includes("application/octet-stream");

      res.writeHead(status, sanitizeResponseHeaders(proxyRes.headers));

      // For non-streaming 2xx JSON responses: buffer so we can extract usage counts.
      if (!isStream && status >= 200 && status < 300 && taskId) {
        const chunks: Buffer[] = [];
        proxyRes.on("data", (c: Buffer) => chunks.push(c));
        proxyRes.on("end", () => {
          const body = Buffer.concat(chunks);
          res.end(body);
          try {
            const usage = parseUsageTokens(provider, body.toString("utf-8"));
            if (usage && (usage.inputTokens > 0 || usage.outputTokens > 0)) {
              accumulateProxiedUsage(taskId, usage.inputTokens, usage.outputTokens);
            }
          } catch { /* ignore — never block the response */ }
        });
      } else {
        proxyRes.pipe(res, { end: true });
      }
    });

    proxyReq.on("error", (err) => {
      if (!res.headersSent) {
        res.status(502).json({ error: `Upstream error: ${err.message}` });
      }
    });

    if (bodyBuf) proxyReq.write(bodyBuf);
    proxyReq.end();
  });

  return router;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeResponseHeaders(
  headers: http.IncomingHttpHeaders,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  // Drop hop-by-hop headers that must not be forwarded
  const HOP = new Set([
    "transfer-encoding",
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "upgrade",
    // We strip accept-encoding on the request so the upstream returns plain
    // JSON, but some providers still echo a content-encoding header.  Strip
    // it here so the downstream client (agent SDK) doesn't try to decompress
    // a body that is already uncompressed.
    "content-encoding",
  ]);
  for (const [k, v] of Object.entries(headers)) {
    if (HOP.has(k.toLowerCase())) continue;
    if (v !== undefined) out[k] = v as string | string[];
  }
  return out;
}
