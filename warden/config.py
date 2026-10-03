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


# /validate plan reviewer (validate.maybe_apply_local_reasoning). Default
# "ollama", unchanged since 13 September. "laya" selects the fine-tuned Laya
# classifier in laya_review.py (Docs/decisions/brain-laya-plan-review.md).
# Either can only turn accept into ask, so an unknown value falls back to the
# default rather than failing /validate.
def reviewer_mode() -> str:
    raw = os.environ.get("WARDEN_REVIEWER", "ollama").strip().lower()
    return "laya" if raw == "laya" else "ollama"


# Laya checkpoints (3 October 2026). WARDEN_LAYA_MODEL used to be read by both
# laya_review.py and fastpath.py, so naming the reviewer's checkpoint also made it the
# fast path's decision model. Each now has its own name; WARDEN_LAYA_MODEL stays a
# fallback for the reviewer only, since the README, the decision record and the e2e-v5
# harness document it that way.
def reviewer_model():
    for name in ("WARDEN_REVIEWER_MODEL", "WARDEN_LAYA_MODEL"):
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return None


def fast_path_laya_model():
    return os.environ.get("WARDEN_FAST_PATH_LAYA_MODEL", "").strip() or None


# Extension <-> Warden pairing secret (pairing.py). Required since 2 October 2026
# (Francis): with no secret every POST is refused with setup instructions.
#   required       WARDEN_PAIRING_SECRET set, at least PAIRING_MIN_LEN characters
#   misconfigured  set but shorter: refused, never run with a guessable secret
#   missing        unset: refused
#   disabled       unset and WARDEN_PAIRING_DISABLED=1: for scripted harnesses only.
#                  The extension never accepts a Warden that cannot prove pairing, so
#                  this flag cannot weaken it; it only lets non-extension tools in.
PAIRING_MIN_LEN = 32


def pairing_secret():
    return os.environ.get("WARDEN_PAIRING_SECRET", "").strip() or None


def pairing_state() -> str:
    secret = pairing_secret()
    if secret is not None:
        return "required" if len(secret) >= PAIRING_MIN_LEN else "misconfigured"
    if os.environ.get("WARDEN_PAIRING_DISABLED", "").strip() == "1":
        return "disabled"
    return "missing"


_LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})

# Host header allow-list (3 October 2026). Binding to 127.0.0.1 does not stop DNS
# rebinding: a web page on a name that later resolves to 127.0.0.1 reaches this port
# same-origin, and its requests carry that name in Host. Only loopback names are
# answered (any port, so a harness on another port still works). Tests add their own
# client host in a fixture; production never does.
ALLOWED_HOSTNAMES = _LOOPBACK_HOSTS

# Request body cap, enforced from Content-Length before the body is read, verified or
# parsed (3 October 2026). content.js caps the serialised DOM at 30 KB, so a whole
# /strip or /plan request is far below this; it only stops an unbounded read.
MAX_BODY_BYTES = int(os.environ.get("WARDEN_MAX_BODY_BYTES", str(2 * 1024 * 1024)))


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
# Probed that day across this account's reachable catalogue, only two models were
# usable (the chain then had two entries; the 30 September note below supersedes
# it). Re-probe before editing; do not add a model id because it looks plausible,
# since a dead entry costs a wasted request on every call.
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
# Default 60 s, the floor ollama_client enforces (MIN_TIMEOUT_S, the measured cold start);
# the old default of 12 s was always raised to it, so it said one thing and did another.
OLLAMA_TIMEOUT_S = float(os.environ.get("WARDEN_OLLAMA_TIMEOUT_S", "60"))

# CORS: chrome-extension scheme (any extension id, Chrome's real alphabet is
# a-p, 32 chars) plus http://127.0.0.1 and http://localhost, with or without
# an explicit port. No wildcard origin.
CORS_ORIGIN_REGEX = r"^(chrome-extension://[a-p]{32}|http://127\.0\.0\.1(:\d+)?|http://localhost(:\d+)?)$"

import redactor as _redactor  # noqa: E402 -- after env/config setup above

REGEX_PATTERN_COUNT = len(_redactor.PASSES)
