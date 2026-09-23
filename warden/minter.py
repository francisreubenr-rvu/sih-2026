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


class TokenMinter:
    def __init__(self) -> None:
        self.counts: dict[str, int] = {}
        self.tokens: dict[str, str] = {}
        self.decisions: list[dict] = []

    def next_id(self, type_name: str) -> str:
        """Reserve and return the next token id for `type_name` without
        recording a value or a decision. Used so an uncertain GLiNER span can
        be told what its token WOULD be (for `resolved` lookups) even before
        anyone decides whether to strip it.
        """
        count = self.counts.get(type_name, 0) + 1
        self.counts[type_name] = count
        return f"{type_name}#{count}"

    def mint(
        self,
        type_name: str,
        value: str,
        score: float,
        layer: str,
        pattern: Optional[str] = None,
        token: Optional[str] = None,
    ) -> str:
        """Record `value` under a token (reserving a fresh one via next_id()
        unless `token` -- an already-reserved id from next_id() -- is given)
        and append a decision. Returns the token string, which callers use as
        the literal replacement text.
        """
        tok = token if token is not None else self.next_id(type_name)
        self.tokens[tok] = value
        self.decisions.append(
            {
                "pattern": pattern if pattern is not None else type_name.lower(),
                "score": score,
                "layer": layer,
            }
        )
        return tok
