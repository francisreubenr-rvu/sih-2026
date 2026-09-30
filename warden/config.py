"""config.py: environment and configuration for the Warden.

No third-party dotenv dependency: warden/.env is a short key=value file, so a
tiny hand-rolled loader keeps the dependency count down per the project's
minimal-dependencies rule.
"""

import os
from pathlib import Path
from urllib.parse import urlparse

WARDEN_DIR = Path(__file__).resolve().parent
WARDEN_VERSION = "0.1.0"


def _load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv(WARDEN_DIR / ".env")

PORT = int(os.environ.get("WARDEN_PORT", "8756"))

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "").strip() or None


def groq_configured() -> bool:
    return GROQ_API_KEY is not None


# POST /plan planner. Default "groq" (29 September 2026): the local machine
# runs a model for one job, PII redaction, and planning goes to the cloud on
# already-tokenized text. "ollama" is the explicit offline mode. Anything else
# is invalid and the route fails closed rather than guessing.
def planner_mode() -> str:
    raw = os.environ.get("WARDEN_PLANNER", "groq").strip().lower()
    if raw in ("", "groq"):
        return "groq"
    if raw == "ollama":
        return "ollama"
    return "invalid"


def planner_destination(mode: str):
    """Where a /plan body goes for this planner mode: "cloud", "local", or None
    when the mode is invalid and nothing is sent anywhere."""
    return {"groq": "cloud", "ollama": "local"}.get(mode)


def planner_model(mode: str):
    """The first model the planner will try, or None."""
    if mode == "groq":
        return GROQ_MODEL_CHAIN[0] if GROQ_MODEL_CHAIN else None
    if mode == "ollama":
        return OLLAMA_MODEL or None
    return None


_LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})


def is_loopback_base(url: str) -> bool:
    """True for http(s) URLs whose host is loopback and which have no userinfo,
    query, fragment, or path beyond '/'. Used to refuse a non-local Ollama host
    before any socket is opened.
    """
    try:
        parsed = urlparse((url or "").strip())
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    if parsed.username or parsed.password:
        return False
    if parsed.query or parsed.fragment:
        return False
    if parsed.path not in ("", "/"):
        return False
    host = (parsed.hostname or "").lower()
    return host in _LOOPBACK_HOSTS


def ollama_model_is_local(model: str) -> bool:
    name = (model or "").strip().lower()
    return bool(name) and not name.endswith(":cloud")


# Fallback chain is configuration, not a hardcoded constant: overridable via
# GROQ_MODEL_CHAIN as a comma-separated list, defaulting to the frozen
# spec's three real Groq model ids in order.
# The chain must name models the ACCOUNT CAN ACTUALLY REACH, not models that
# exist in some catalogue. The original chain was
# "llama-3.3-70b-versatile,openai/gpt-oss-20b,llama-3.1-8b-instant" and probing
# this key on 13 September 2026 showed only the middle one worked:
#
#   llama-3.3-70b-versatile  -> "does not exist or you do not have access"
#   openai/gpt-oss-20b       -> available
#   llama-3.1-8b-instant     -> "does not exist or you do not have access"
#
# So every request paid a failed round trip before succeeding, and the third
# fallback did not exist, meaning there was effectively no fallback at all.
# Probed across this account's reachable catalogue the only two usable models
# are the two below. Re-probe before editing; do not add a model id because it
# looks plausible, since a dead entry costs a wasted request on every call.
#
# 30 September 2026 (Francis): qwen/qwen3.8-27b goes first. Re-probed that day,
# all three answer on this account. On the Warden's own prompt it was correct
# on 36 of 36 valid answers at p50 342 ms, against 31 of 31 at 615 ms for
# gpt-oss-20b (Benchmarks/results/cloud-model-bench-groq-v02.json). Its free-tier
# token limit is lower: under load it has returned "Request too large" 429s,
# which the chain treats like any 429 and moves on.
_DEFAULT_CHAIN = "qwen/qwen3.8-27b,openai/gpt-oss-20b,openai/gpt-oss-120b"
GROQ_MODEL_CHAIN = [
    m.strip() for m in os.environ.get("GROQ_MODEL_CHAIN", _DEFAULT_CHAIN).split(",") if m.strip()
]

# OpenAI-compatible base URL the Groq client posts to. Overridable so a test can
# point the real client at a local fake server; the API key is sent to
# whatever this names, so it is only ever set deliberately.
GROQ_BASE_URL = os.environ.get("GROQ_BASE_URL", "https://api.groq.com/openai/v1").strip().rstrip("/")

GROQ_TIMEOUT_S = float(os.environ.get("WARDEN_GROQ_TIMEOUT_S", "10"))

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.environ.get("WARDEN_OLLAMA_MODEL", "qwythos-9b:latest")
OLLAMA_TIMEOUT_S = float(os.environ.get("WARDEN_OLLAMA_TIMEOUT_S", "12"))

# CORS: chrome-extension scheme (any extension id, Chrome's real alphabet is
# a-p, 32 chars) plus http://127.0.0.1 and http://localhost, with or without
# an explicit port. No wildcard origin.
CORS_ORIGIN_REGEX = r"^(chrome-extension://[a-p]{32}|http://127\.0\.0\.1(:\d+)?|http://localhost(:\d+)?)$"

import redactor as _redactor  # noqa: E402 -- after env/config setup above

REGEX_PATTERN_COUNT = len(_redactor.PASSES)
