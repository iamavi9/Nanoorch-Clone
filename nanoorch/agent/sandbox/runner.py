import os
import sys
import json
import base64
import subprocess
import tempfile

language = os.environ.get("LANGUAGE", "python").lower()
code_b64 = os.environ.get("CODE_B64", "")
timeout_seconds = int(os.environ.get("TIMEOUT_SECONDS", "25"))

SUPPORTED = "python, javascript, bash, ruby, r, go, java"

try:
    code = base64.b64decode(code_b64).decode("utf-8")
except Exception as e:
    print(json.dumps({"stdout": "", "stderr": f"Failed to decode code: {e}", "exitCode": 1}))
    sys.exit(0)

if language in ("python", "python3"):
    suffix = ".py"
    cmd_prefix = ["python"]
elif language in ("javascript", "js", "node", "typescript", "ts"):
    suffix = ".js"
    cmd_prefix = ["node"]
elif language in ("bash", "sh", "shell"):
    suffix = ".sh"
    cmd_prefix = ["bash"]
elif language == "ruby":
    suffix = ".rb"
    cmd_prefix = ["ruby"]
elif language in ("r", "rscript"):
    suffix = ".R"
    cmd_prefix = ["Rscript"]
elif language == "go":
    suffix = ".go"
    cmd_prefix = ["go", "run"]
elif language == "java":
    suffix = ".java"
    cmd_prefix = ["java", "--source", "21"]
else:
    print(json.dumps({
        "stdout": "",
        "stderr": f"Unsupported language: {language}. Supported: {SUPPORTED}",
        "exitCode": 1,
    }))
    sys.exit(0)

try:
    with tempfile.NamedTemporaryFile(mode="w", suffix=suffix, delete=False, dir="/tmp") as f:
        f.write(code)
        fname = f.name

    # cmd_prefix is a hardcoded list derived from the if/elif chain above;
    # fname is a securely-created tempfile path — no user input reaches the shell.
    result = subprocess.run(  # noqa: S603  # nosemgrep: python.lang.security.audit.dangerous-subprocess-use-audit
        cmd_prefix + [fname],  # cmd_prefix is from a static allowlist; fname is a secure tempfile
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
    )

    print(json.dumps({
        "stdout": result.stdout[:10000],
        "stderr": result.stderr[:5000],
        "exitCode": result.returncode,
    }))
except subprocess.TimeoutExpired:
    print(json.dumps({"stdout": "", "stderr": f"Execution timed out after {timeout_seconds} seconds", "exitCode": 124}))
except Exception as e:
    print(json.dumps({"stdout": "", "stderr": str(e), "exitCode": 1}))
