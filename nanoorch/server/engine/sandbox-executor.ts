import { spawn } from "child_process";
import { existsSync, writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE ?? "nanoorch-sandbox:latest";
const SANDBOX_RUNTIME = process.env.SANDBOX_RUNTIME ?? "runsc";
const DEFAULT_SANDBOX_TIMEOUT_S = 30;

const ALLOWED_LANGUAGE_RE = /^[a-zA-Z0-9_-]{1,20}$/;

function sanitizeLanguage(language: string): string | null {
  const lang = language.trim().toLowerCase();
  return ALLOWED_LANGUAGE_RE.test(lang) ? lang : null;
}

const INFRA_ERROR_PATTERNS = [
  "no such image",
  "unable to find image",
  "unknown runtime",
  "cannot connect to the docker daemon",
  "permission denied",
  "no such file or directory",
  "failed to start sandbox container",
];

function isInfraError(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return INFRA_ERROR_PATTERNS.some((p) => lower.includes(p));
}

export function isSandboxAvailable(): boolean {
  const socketPath = process.env.DOCKER_SOCKET ?? "/var/run/docker.sock";
  return existsSync(socketPath);
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  infraError?: boolean;
}

export async function executeCodeInSandbox(
  language: string,
  code: string,
  timeoutSeconds: number = DEFAULT_SANDBOX_TIMEOUT_S
): Promise<SandboxResult> {
  const codeB64 = Buffer.from(code).toString("base64");
  const innerTimeoutSeconds = Math.max(5, timeoutSeconds - 5);
  const outerTimeoutMs = timeoutSeconds * 1000;

  const dockerSocket = process.env.DOCKER_SOCKET ?? "/var/run/docker.sock";

  const dockerArgs = [
    "run",
    "--rm",
    "--runtime", SANDBOX_RUNTIME,
    "--network", "none",
    "--read-only",
    "--memory", "256m",
    "--cpus", "0.5",
    "--pids-limit", "64",
    "--tmpfs", "/tmp:size=64m",
    // Drop every Linux capability — the sandbox runs unprivileged code and
    // needs none of them.  Paired with --read-only + no network this is the
    // first line of defence before gVisor / runsc even gets involved.
    "--cap-drop", "ALL",
    // Prevent any process inside from gaining new privileges via setuid
    // binaries or filesystem capabilities.
    "--security-opt", "no-new-privileges",
    // If the operator has supplied a host-path to a seccomp profile, apply it.
    // Example: SECCOMP_PROFILE=/etc/nanoorch/seccomp/nanoorch.json
    ...(process.env.SECCOMP_PROFILE
      ? existsSync(process.env.SECCOMP_PROFILE)
        ? ["--security-opt", `seccomp=${process.env.SECCOMP_PROFILE}`]
        : (console.warn(`[sandbox] SECCOMP_PROFILE is set but file not found at ${process.env.SECCOMP_PROFILE} — seccomp disabled. Copy agent/seccomp/nanoorch.json to that path.`), [])
      : []),
    "-e", `LANGUAGE=${language}`,
    "-e", `CODE_B64=${codeB64}`,
    "-e", `TIMEOUT_SECONDS=${innerTimeoutSeconds}`,
    SANDBOX_IMAGE,
  ];

  return new Promise((resolve) => {
    const proc = spawn("docker", dockerArgs, {
      env: { ...process.env, DOCKER_HOST: `unix://${dockerSocket}` },
    });

    let rawStdout = "";
    let rawStderr = "";

    proc.stdout.on("data", (d: Buffer) => { rawStdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { rawStderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve({ stdout: "", stderr: `Sandbox timed out after ${timeoutSeconds} seconds`, exitCode: 124 });
    }, outerTimeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      try {
        const result = JSON.parse(rawStdout.trim()) as SandboxResult;
        resolve(result);
      } catch {
        const stderr = rawStderr.slice(0, 5000) || "Container exited unexpectedly";
        resolve({
          stdout: rawStdout.slice(0, 10000),
          stderr,
          exitCode: code ?? 1,
          infraError: isInfraError(stderr),
        });
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      const stderr = `Failed to start sandbox container: ${err.message}`;
      resolve({ stdout: "", stderr, exitCode: 1, infraError: true });
    });
  });
}

const LOCAL_RUNNERS: Record<string, { cmd: string; ext: string; extraArgs?: string[] }> = {
  python:     { cmd: "python3", ext: "py" },
  python3:    { cmd: "python3", ext: "py" },
  javascript: { cmd: "node",    ext: "js" },
  js:         { cmd: "node",    ext: "js" },
  node:       { cmd: "node",    ext: "js" },
  typescript: { cmd: "node",    ext: "js" },
  ts:         { cmd: "node",    ext: "js" },
  bash:       { cmd: "bash",    ext: "sh" },
  sh:         { cmd: "bash",    ext: "sh" },
  shell:      { cmd: "bash",    ext: "sh" },
  ruby:       { cmd: "ruby",    ext: "rb" },
  r:          { cmd: "Rscript", ext: "R"  },
  rscript:    { cmd: "Rscript", ext: "R"  },
  go:         { cmd: "go",      ext: "go", extraArgs: ["run"] },
  java:       { cmd: "java",    ext: "java", extraArgs: ["--source", "21"] },
};

export async function executeCodeLocally(
  language: string,
  code: string,
  timeoutSeconds: number = DEFAULT_SANDBOX_TIMEOUT_S
): Promise<SandboxResult> {
  const runner = LOCAL_RUNNERS[language.toLowerCase()];
  if (!runner) {
    return {
      stdout: "",
      stderr: `Language '${language}' is not available for local execution. Supported: python, javascript, bash, ruby, r, go, java.`,
      exitCode: 1,
      infraError: false,
    };
  }

  const tmpFile = join(
    tmpdir(),
    `nanoorch_${Date.now()}_${Math.random().toString(36).slice(2)}.${runner.ext}`
  );

  try {
    writeFileSync(tmpFile, code, "utf-8");
  } catch (err: any) {
    return { stdout: "", stderr: `Failed to write temp file: ${err.message}`, exitCode: 1, infraError: false };
  }

  return new Promise((resolve) => {
    const proc = spawn(runner.cmd, [...(runner.extraArgs ?? []), tmpFile]);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      try { unlinkSync(tmpFile); } catch {}
      resolve({ stdout: "", stderr: `Execution timed out after ${timeoutSeconds} seconds`, exitCode: 124, infraError: false });
    }, timeoutSeconds * 1000);

    proc.on("close", (code) => {
      clearTimeout(timer);
      try { unlinkSync(tmpFile); } catch {}
      resolve({
        stdout: stdout.slice(0, 10000),
        stderr: stderr.slice(0, 5000),
        exitCode: code ?? 0,
        infraError: false,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      try { unlinkSync(tmpFile); } catch {}
      const rtLabel: Record<string, string> = {
        python3: "Python", node: "Node.js", bash: "Bash",
        ruby: "Ruby", Rscript: "R (Rscript)", go: "Go", java: "Java",
      };
      const rtName = rtLabel[runner.cmd] ?? runner.cmd;
      const msg = err.message.includes("ENOENT") || err.message.includes("not found")
        ? `${rtName} is not installed on this server`
        : `Failed to execute: ${err.message}`;
      resolve({ stdout: "", stderr: msg, exitCode: 1, infraError: false });
    });
  });
}

/**
 * Auto-print preprocessor — catches the common REPL-style mistake where the
 * AI writes a bare expression on the last line (e.g. `sha256_hash` or `result`)
 * instead of `print(sha256_hash)`.  Scripts, unlike REPLs, silently discard
 * bare expressions.  We detect the pattern and wrap the last line with the
 * appropriate print call so the user always sees output.
 *
 * Only applied to Python and JavaScript; other languages either require explicit
 * output constructs already (Go, Java) or the AI reliably uses echo/puts/print.
 */
function ensureOutput(language: string, code: string): string {
  const lang = language.toLowerCase();
  if (lang !== "python" && lang !== "javascript" && lang !== "js") return code;

  const lines = code.split("\n");

  // Find the last non-blank, non-comment line
  let lastIdx = lines.length - 1;
  while (lastIdx >= 0 && lines[lastIdx].trim() === "") lastIdx--;
  if (lastIdx < 0) return code;

  const lastLine = lines[lastIdx];
  const trimmed  = lastLine.trim();

  // Skip lines that are already output statements or control-flow keywords
  const PYTHON_SKIP = [
    "print(", "print (", "import ", "from ", "def ", "class ",
    "return ", "raise ", "if ", "elif ", "else:", "else :", "for ",
    "while ", "try:", "except", "finally:", "with ", "assert ",
    "del ", "pass", "break", "continue", "#", "yield ", "async ",
  ];
  const JS_SKIP = [
    "console.", "process.", "return ", "throw ", "if ", "else",
    "for ", "while ", "switch ", "break", "continue", "//",
    "import ", "export ", "const ", "let ", "var ", "function ",
    "class ", "async ", "await ",
  ];

  const skipList = lang === "python" ? PYTHON_SKIP : JS_SKIP;
  if (skipList.some((s) => trimmed.startsWith(s))) return code;

  // Skip if the line is indented (inside a block — wrapping would be a syntax error)
  if (lastLine !== lastLine.trimStart()) return code;

  // Skip single-character lines and empty assignments
  if (trimmed.length < 2) return code;

  // Wrap bare expression with the appropriate print call
  if (lang === "python") {
    lines[lastIdx] = `print(${trimmed})`;
  } else {
    lines[lastIdx] = `console.log(${trimmed});`;
  }

  return lines.join("\n");
}

export async function runCode(
  language: string,
  code: string,
  timeoutSeconds: number = DEFAULT_SANDBOX_TIMEOUT_S
): Promise<SandboxResult> {
  const sanitized = sanitizeLanguage(language);
  if (!sanitized) {
    return {
      stdout: "",
      stderr: `Invalid language identifier '${language}'. Use alphanumeric names only (e.g. python, javascript, bash).`,
      exitCode: 1,
      infraError: false,
    };
  }
  const processedCode = ensureOutput(sanitized, code);
  if (isSandboxAvailable()) {
    const result = await executeCodeInSandbox(sanitized, processedCode, timeoutSeconds);
    if (!result.infraError) return result;
  }
  return executeCodeLocally(sanitized, processedCode, timeoutSeconds);
}
