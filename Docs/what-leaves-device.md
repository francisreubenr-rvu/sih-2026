# What leaves the device

Short honesty one-pager for judges and teammates. Product copy lives on the Website; this Doc points at the contracts and the code.

## Summary

| Leaves (Reason path only) | Stays local |
|---------------------------|-------------|
| Semantic scene fields: allowlisted control labels, geometry, opaque region kinds | Raw pixels / screenshots |
| Sent to local Node (+ Ollama when planner used) after sanitize | Field values, URLs, free text, pairing secrets |

- **DigiLocker** = inspired UX / trust pattern only — not partner, API, credential share, or custody.
- A smaller semantic payload is **not** anonymity; layout can still reveal task structure.

## Source of truth

- Copy rules: [`Docs/decisions/brain-72h-contracts-copy.md`](decisions/brain-72h-contracts-copy.md)
- Scene scheme / Zod: [`Prototype/shared/protocol.mjs`](../Prototype/shared/protocol.mjs) (`dhristi-semantic-v1`)
- Sanitize helpers: [`Prototype/shared/rubric-hooks.mjs`](../Prototype/shared/rubric-hooks.mjs) (`assertSanitizedPayload`), [`Prototype/shared/capture-loop.mjs`](../Prototype/shared/capture-loop.mjs) (`buildSanitizedPlanRequest`)
- Privacy ADR: [`Docs/decisions/privacy-boundary.md`](decisions/privacy-boundary.md)
- Public wording: Website trust bar + privacy section (`Website/index.html`)

Do not invent egress fields beyond the allowlisted scene schema enforced by those helpers.
