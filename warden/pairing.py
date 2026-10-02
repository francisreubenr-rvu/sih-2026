"""pairing.py: a shared secret between the extension and this Warden (30 September 2026).

Why: the extension trusted whatever answered on 127.0.0.1:8756. Since the Laya
release (Docs/decisions/brain-laya-plan-review.md) a response can skip a local
confirmation, so an impostor on that port must not be able to produce one. The
secret never crosses the wire; both directions carry HMAC-SHA256 proofs.

  request   X-Dhristi-Nonce: fresh random value per request
            X-Dhristi-Auth:  HMAC(secret, "dhristi-req\\n{METHOD}\\n{path}\\n{nonce}\\n{sha256(body)}")
  response  X-Dhristi-Proof: HMAC(secret, "dhristi-res\\n{path}\\n{nonce}\\n{status}\\n{sha256(body)}")

The two labels keep a request proof from being reflected as a response proof.
The nonce binds each response to the request that asked for it, so an old
response cannot be replayed; the Warden also refuses a nonce it has already seen.

The secret comes from WARDEN_PAIRING_SECRET (warden/.env, gitignored). Unset
means pairing is off and the Warden behaves as before. Make one with:

    python pairing.py new
"""

import base64
import hashlib
import hmac
import re
import secrets
import sys
import threading
import time

NONCE_RE = re.compile(r"^[A-Za-z0-9_-]{16,128}$")
REPLAY_WINDOW_S = 600
REPLAY_MAX = 10000


def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _mac(secret: str, message: str) -> str:
    return b64url(hmac.new(secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).digest())


def _sha256_hex(body: bytes) -> str:
    return hashlib.sha256(body or b"").hexdigest()


def request_mac(secret: str, method: str, path: str, nonce: str, body: bytes) -> str:
    return _mac(secret, f"dhristi-req\n{method.upper()}\n{path}\n{nonce}\n{_sha256_hex(body)}")


def response_mac(secret: str, path: str, nonce: str, status: int, body: bytes) -> str:
    return _mac(secret, f"dhristi-res\n{path}\n{nonce}\n{int(status)}\n{_sha256_hex(body)}")


def valid_nonce(nonce) -> bool:
    return isinstance(nonce, str) and bool(NONCE_RE.match(nonce))


class ReplayGuard:
    """Remembers nonces seen in the last REPLAY_WINDOW_S seconds, bounded."""

    def __init__(self) -> None:
        self._seen: dict[str, float] = {}
        self._lock = threading.Lock()

    def first_use(self, nonce: str) -> bool:
        now = time.monotonic()
        with self._lock:
            if len(self._seen) >= REPLAY_MAX or (self._seen and next(iter(self._seen.values())) < now - REPLAY_WINDOW_S):
                self._seen = {n: t for n, t in self._seen.items() if t >= now - REPLAY_WINDOW_S}
                if len(self._seen) >= REPLAY_MAX:
                    # Still full inside the window: refuse rather than forget, so a flood
                    # cannot evict a nonce and make its request replayable.
                    return False
            if nonce in self._seen:
                return False
            self._seen[nonce] = now
            return True


def verify_request(secret: str, method: str, path: str, nonce, auth, body: bytes) -> bool:
    if not valid_nonce(nonce) or not isinstance(auth, str):
        return False
    return hmac.compare_digest(request_mac(secret, method, path, nonce, body), auth)


def new_secret() -> str:
    return b64url(secrets.token_bytes(32))


if __name__ == "__main__":
    if sys.argv[1:] == ["new"]:
        print(new_secret())
    else:
        print("usage: python pairing.py new   (prints a fresh pairing secret)", file=sys.stderr)
        sys.exit(2)
