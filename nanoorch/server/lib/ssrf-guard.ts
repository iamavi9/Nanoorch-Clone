/**
 * SSRF (Server-Side Request Forgery) protection guard.
 *
 * Validates URLs before they are used in server-side outbound fetch() calls.
 * Blocks private/internal/cloud-metadata IP ranges and disallowed protocols
 * to prevent attackers from using the server as a proxy to reach internal services.
 */

const BLOCKED_HOSTNAME_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^::1$/,
  /^::$/,
  /^fc[0-9a-f]{2}:/i,
  /^fe80:/i,
];

const BLOCKED_HOSTNAMES = new Set<string>([
  "localhost",
  "metadata.google.internal",
  "169.254.169.254",
  "100.100.100.200",
]);

/**
 * Validates that a URL is safe to use in a server-side fetch call.
 *
 * Throws an error if the URL:
 * - cannot be parsed
 * - uses a protocol not in `allowedProtocols`
 * - targets a private, loopback, link-local, or cloud-metadata address
 *
 * @param rawUrl          - The URL string to validate.
 * @param allowedProtocols - Allowed protocols. Defaults to ["https:"].
 */
export function assertSafeUrl(rawUrl: string, allowedProtocols: string[] = ["https:"]): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL.");
  }

  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(
      `URL protocol "${parsed.protocol}" is not allowed. Allowed: ${allowedProtocols.join(", ")}`
    );
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error("URL targets a disallowed hostname.");
  }

  for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new Error("URL targets a private or reserved address.");
    }
  }
}
