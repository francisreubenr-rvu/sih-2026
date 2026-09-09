# SIH26171 — verified problem identity

Verified 9 September 2026. The initial user shorthand SIH2171 is superseded by the complete statement supplied in the goal attachment, and by the retrieved organizer catalogue.

| Field | Verified value |
|---|---|
| ID | SIH26171 (numeric 26171) |
| Title | On-device Visual Perception for Light-weight Browser Agents |
| Organization | Indian Space Research Organisation (ISRO) |
| Department | Department of Space / Indian Space Research Organisation |
| Category / theme | Software / Smart Automation |
| Internal delivery target | 11 September 2026, user instruction |
| Catalogue date shown | 30 September 2026; do not substitute this for the team's internal target |

Primary source: [SIH 2026 problem statements](https://www.sih.gov.in/sih2026PS), retrieved 9 September 2026, archived as `Raw/domain/sih-official.txt` (SHA256 `04ed9ddbcb9876a2918db6a0c8025034136a7cb29eeeadc175fbbfa03ed9261f`). Exact relevant text is extracted to `Raw/domain/sih26171-official-extract.txt`. This supersedes earlier retrieval failures; those historical records remain preserved.

Independent cross-check: [community archive of SIH26171](https://github.com/Vigneshrdy/sih-ps-archive/blob/main/2026/SIH26171.md), archived in `Raw/domain/sih26171-community.txt`. Community status is not organizer authority.

## Required behavior

Run a local vision model (ViT or equivalent CV) in browser JavaScript/extension. Detect and redact sensitive visual/DOM content before network transmission. Send only sanitized context to a centralized LLM/VLM, which returns data or a browser action executed locally. Demonstrate a complete task and measure the latency/accuracy/resource trade-off. Open-source or open-weight server models are permitted. Any open-source dataset may be used; finale evaluation use cases will be supplied then.

| Organizer metric | Weight |
|---|---:|
| Accuracy of visual context | 25% |
| Sensitive/PII detection recall and precision | 20% |
| Redaction precision | 20% |
| Client resource utilization | 20% |
| Overall task latency | 15% |

The organizer supplies weights, not complete scoring formulas or numerical acceptance thresholds. Our local measurement contracts must remain explicitly self-imposed and cannot be represented as official score predictions.
