/**
 * Redis client singleton for NanoOrch.
 *
 * Usage is entirely optional — all callers check for null and fall back
 * to PostgreSQL / in-memory alternatives when REDIS_URL is not set.
 *
 * Set REDIS_URL in your .env or docker-compose environment to enable:
 *   REDIS_URL=redis://redis:6379
 */

import IORedis from "ioredis";

let _client: IORedis | null = null;
let _initialised = false;

export function getRedisClient(): IORedis | null {
  if (_initialised) return _client;
  _initialised = true;

  const url = process.env.REDIS_URL;
  if (!url) {
    console.log("[redis] REDIS_URL not set — session store and rate limits will use in-process fallbacks");
    return null;
  }

  try {
    _client = new IORedis(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    _client.on("connect",   ()  => console.log("[redis] Connected"));
    _client.on("ready",     ()  => console.log("[redis] Ready"));
    _client.on("error",     (e) => console.error("[redis] Error:", e.message));
    _client.on("close",     ()  => console.warn("[redis] Connection closed"));
    _client.on("reconnecting", () => console.log("[redis] Reconnecting…"));

    return _client;
  } catch (err: any) {
    console.error("[redis] Failed to create client:", err.message);
    _client = null;
    return null;
  }
}

/**
 * Wraps an ioredis client so it satisfies the node-redis v4 interface that
 * connect-redis v7+ expects.  The key difference is the SET signature:
 *   node-redis: client.set(key, value, { EX: ttl })
 *   ioredis:    client.set(key, value, 'EX', ttl)
 * Without this shim, connect-redis passes the options object as a positional
 * arg which ioredis converts to "[object Object]", causing a Redis syntax error.
 */
export function makeNodeRedisCompat(client: IORedis) {
  return {
    get: (key: string) => client.get(key),

    del: (...keys: string[]) => client.del(...keys),

    set: (
      key: string,
      value: string,
      opts?: { EX?: number; PX?: number; NX?: boolean; XX?: boolean },
    ) => {
      if (opts?.PX) return client.set(key, value, "PX", opts.PX);
      if (opts?.EX) return client.set(key, value, "EX", opts.EX);
      return client.set(key, value);
    },

    // connect-redis calls scan with node-redis cursor/options format
    scan: async (
      cursor: number | string,
      opts?: { MATCH?: string; COUNT?: number },
    ) => {
      const args: (string | number)[] = [cursor];
      if (opts?.MATCH) args.push("MATCH", opts.MATCH);
      if (opts?.COUNT) args.push("COUNT", opts.COUNT);
      const [nextCursor, keys] = await (client.scan as (...a: any[]) => Promise<[string, string[]]>)(...args);
      return { cursor: nextCursor, keys };
    },

    // touch() calls expire to refresh the session TTL — same signature on both clients
    expire: (key: string, ttlSeconds: number) => client.expire(key, ttlSeconds),

    // ioredis uses mget; return as array matching node-redis expectations
    mGet: (keys: string[]) => client.mget(...keys),
  };
}

/**
 * Minimal express-rate-limit v7 store backed by ioredis.
 * Returns totalHits and a resetTime derived from the key TTL.
 */
export class RedisRateLimitStore {
  // prefix must be public to satisfy the express-rate-limit Store interface
  readonly prefix: string;
  private readonly client: IORedis;
  private readonly windowMs: number;

  constructor(client: IORedis, windowMs: number, prefix: string = "rl:") {
    this.client = client;
    this.windowMs = windowMs;
    this.prefix = prefix;
  }

  private key(k: string) { return `${this.prefix}${k}`; }

  async increment(key: string): Promise<{ totalHits: number; resetTime: Date | undefined }> {
    const rk  = this.key(key);
    const ttlS = Math.ceil(this.windowMs / 1000);

    const pipeline = this.client.pipeline();
    pipeline.incr(rk);
    pipeline.pttl(rk);
    const results = await pipeline.exec();

    const totalHits = (results?.[0]?.[1] as number) ?? 1;
    const pttl      = (results?.[1]?.[1] as number) ?? -1;

    if (pttl < 0) {
      await this.client.expire(rk, ttlS);
    }

    const resetTime = pttl > 0
      ? new Date(Date.now() + pttl)
      : new Date(Date.now() + this.windowMs);

    return { totalHits, resetTime };
  }

  async decrement(key: string): Promise<void> {
    await this.client.decr(this.key(key));
  }

  async resetKey(key: string): Promise<void> {
    await this.client.del(this.key(key));
  }
}
