import { readFileSync } from "fs";

/**
 * Load a secret value using the _FILE pattern (Docker secrets / tmpfs mounts).
 *
 * Priority order:
 *   1. If `${name}_FILE` is set, read the value from that file path.
 *      → This keeps real credentials out of `docker inspect Env`.
 *   2. Otherwise fall back to `process.env[name]`.
 *
 * Example (docker-compose.yml):
 *   environment:
 *     SESSION_SECRET_FILE: /run/secrets/session_secret
 *   secrets:
 *     - session_secret
 */
export function loadSecret(name: string): string | undefined {
  // Restrict name to safe identifier characters to prevent any env key injection
  if (!/^[A-Z0-9_]+$/i.test(name)) return undefined;
  const filePath = process.env[`${name}_FILE`];
  if (filePath) {
    try {
      return readFileSync(filePath, "utf-8").trim();
    } catch (err: any) {
      // Emit a visible warning so misconfigured secret paths are not silently
      // ignored (which would cause the plain-env fallback to be used instead).
      console.warn(
        `[secrets] WARNING: ${name}_FILE is set to "${filePath}" but the file could not be read: ${err.message}. ` +
        `Falling back to ${name} environment variable.`
      );
    }
  }
  return process.env[name];
}
