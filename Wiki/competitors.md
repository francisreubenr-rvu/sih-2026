# Adjacent solutions and defensible differentiation

Reviewed 9 September 2026. These are technical comparators, not all SIH competitors or winners. Absence of a feature in documentation is marked unverified, not proof the feature does not exist.

| Solution | Documented overlap | Difference we can investigate | Current evidence |
|---|---|---|---|
| [WebPII / WebRedact](https://arxiv.org/abs/2603.17357) | Visual PII detection and synthetic UI benchmark | Browser-local resource measurements plus typed egress/action integration | Our browser inference and schema exist; no head-to-head accuracy evaluation yet |
| [PrivWeb](https://arxiv.org/abs/2509.11939) | Local anonymization, privacy preferences, user control | Explicit pixel-free outbound schema, bounded action vocabulary and expiry | Implemented locally; broader utility comparison pending |
| [Available but Invisible](https://arxiv.org/abs/2602.10139) | Type-preserving placeholders, interaction proxy, privacy gatekeeper | Chrome/Firefox packaging and conservative reconstruction of browser context | Extension package built; browser-specific extension verification pending |
| [Microsoft OmniParser](https://github.com/microsoft/OmniParser) | Screen parsing to support GUI action grounding | Local PII protection before server context ingestion | Different primary function; no claim that all OmniParser deployments lack privacy controls |
| [Microsoft Presidio](https://github.com/microsoft/presidio) | PII recognition/anonymization framework | Browser visual geometry, local face CV and expiring DOM target execution | Text PII coverage and browser adaptation differ; no parity claim |

## Positioning

“An inspectable browser privacy boundary, with measured cost and a reviewed action loop” is a defensible engineering aim. “First private browser agent,” “zero leakage,” “all PII detected,” and “guaranteed winner” are not supported claims.

The current design makes an explicit trade-off: unknown text and images become opaque regions. This improves control over outgoing content but sacrifices visual context and redaction precision. A competitive entry needs measurements and a demonstration of that trade-off, not a novelty adjective.

Source author/title/date metadata are retained in archived primary papers and `Raw/domain/archive-manifest.json`. Peer-review status is not inferred from a search service; cited arXiv records are treated as preprints unless independently established otherwise.

## Reference update — 10 September 2026

[CAPED](https://arxiv.org/abs/2606.12666) adds task-aware pre-upload minimization to the comparison. Its mobile implementation and prototype context-policy limitations reinforce the need for both utility and privacy measurements. Task-aware minimization is prior art, not a new Sightline claim. The supplied VEIL/DRISHTI chat reports are not audited competitor measurements. Detailed decisions and source provenance: [reference review](reference-chat-review.md).
