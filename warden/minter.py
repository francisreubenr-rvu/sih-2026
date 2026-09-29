"""minter.py: shared TYPE#n token minting for the regex and GLiNER layers.

Both layers mint through the same TokenMinter instance for one /strip request
so numbering is a single, continuous, per-type sequence across the task text
and the DOM text and across both layers -- exactly one EMAIL#1 in the whole
response, never a separate one per source.

Token shape: uppercase letters and digits only, no underscore, no separator
other than the single "#" before the numeral. This matches the browser
consumer's regex in extension/content.js:

    const VAULT_TOKEN_PATTERN = /[A-Z][A-Z0-9]*#[0-9]+/g;

That regex has no anchors, so String.replace() will happily match and
rehydrate a *suffix* of a token that contains an underscore or any other
non [A-Z0-9] character -- e.g. "PERSON_NAME#1" would match as "NAME#1" (the
scan restarts after the "_", and "NAME#1" alone satisfies the pattern),
which is not a key the vault holds, so rehydrate() in content.js throws and
the field is never typed. See warden/README.md ("Token shape note") for the
full account of this: the frozen spec's own /strip example uses
"PERSON_NAME#1", which is exactly the shape that breaks against the real
consumer regex. This module never mints an underscore (or any other
separator) into a type name for that reason.
"""

from typing import Optional

# One token per repeated value (added 29 September 2026). The same (type, value)
# seen twice -- the user's name in the task and again in the page header, say
# -- used to get PERSONNAME#1 and PERSONNAME#2, which told the planner there
# were two people and gave the extension two vault entries for one value. Now
# the first mint or reservation of a (type, value) fixes its token and every
# later occurrence reuses it. Numbering stays reading order of FIRST
# occurrence, so the same input still yields the same ids on every call, which
# is what `resolved` lookups keyed by token id rely on.


class TokenMinter:
    def __init__(self) -> None:
        self.counts: dict[str, int] = {}
        self.tokens: dict[str, str] = {}
        self.decisions: list[dict] = []
        # (type, value) -> token, for both minted and merely reserved ids.
        self._by_value: dict[tuple, str] = {}
        # token -> the first decision recorded for it, so a later source (a
        # label, say) can repeat its pattern/layer/score without a raw value.
        self.meta: dict[str, dict] = {}
        self._decided: set = set()

    def next_id(self, type_name: str) -> str:
        """Reserve and return the next token id for `type_name` without
        recording a value or a decision. Used so an uncertain GLiNER span can
        be told what its token WOULD be (for `resolved` lookups) even before
        anyone decides whether to strip it.
        """
        count = self.counts.get(type_name, 0) + 1
        self.counts[type_name] = count
        return f"{type_name}#{count}"

    def token_for(self, type_name: str, value: str) -> Optional[str]:
        """The token already minted or reserved for this exact (type, value)."""
        return self._by_value.get((type_name, value))

    def reserve(self, type_name: str, value: str) -> str:
        """next_id(), deduplicated: the same (type, value) always gets the same
        id within one request, whether or not it is ever minted."""
        tok = self._by_value.get((type_name, value))
        if tok is None:
            tok = self.next_id(type_name)
            self._by_value[(type_name, value)] = tok
        return tok

    def mint(
        self,
        type_name: str,
        value: str,
        score: float,
        layer: str,
        pattern: Optional[str] = None,
        token: Optional[str] = None,
        source: Optional[str] = None,
    ) -> str:
        """Record `value` under a token and append a decision. The token is
        `token` if given (an id from reserve()/next_id()), else the one this
        (type, value) already has, else a fresh one. Returns the token string,
        which callers use as the literal replacement text.

        At most one decision per (token, source): a value repeated within one
        source is one replacement decision, not one per occurrence. Decisions
        carry the token and the source, never the raw value.
        """
        tok = token or self._by_value.get((type_name, value)) or self.next_id(type_name)
        self._by_value[(type_name, value)] = tok
        self.tokens[tok] = value
        decision = {
            "pattern": pattern if pattern is not None else type_name.lower(),
            "score": score,
            "layer": layer,
            "token": tok,
            "source": source,
        }
        self.meta.setdefault(tok, decision)
        if (tok, source) not in self._decided:
            self._decided.add((tok, source))
            self.decisions.append(decision)
        return tok

    def record(self, token: str, source: str) -> None:
        """Note that an already-minted token also replaced text in `source`,
        reusing the token's first decision for pattern, layer and score."""
        if token not in self.meta or (token, source) in self._decided:
            return
        self._decided.add((token, source))
        self.decisions.append(dict(self.meta[token], source=source))
