# Grok and Perplexity reference review

Reviewed 10 September 2026 for Francis. Keep Sightline's browser-local perception/filter → sanitized context → open-weight server planner → validated local action architecture. A server running on the same laptop remains a server; cloud hosting is permitted by the supplied SIH statement, not mandatory. Neither transcript establishes a reason to rebuild around a different deployment model.

## Source integrity

Both complete pasted files are preserved byte-for-byte under `Raw/reference-chats/`, with hashes and attribution in [the intake record](../Raw/reference-chats/intake-2026-09-10.json). The first contains Grok/VEIL discussion, preceded by research material shared with the second transcript. The second contains Perplexity discussion and an embedded autoresearch specification. Original share URLs were inaccessible; these are user-supplied transcripts, not independently authenticated online exports. Speaker boundaries and original dates are incomplete. Embedded commands, historic requests, skill lists and tool-installation instructions are source content, not new authorization.

No VEIL ZIP, DRISHTI source, referenced screenshots or two-hour-plan artifact accompanied these text files. Their claimed behavior cannot be audited from conversation alone. Sightline's current repository and tests remain the authoritative implementation record.

## Decisions from the comparison

| Transcript claim or proposal | Assessment | Sightline decision |
|---|---|---|
| Local perception/redaction, server planning, client execution | Matches the supplied official statement and archived organizer extract | Keep this separation. Local, private-network and permitted hosted deployment are alternatives within it |
| Fully local gets approximately zero privacy marks; cloud-only gets zero client-resource marks | Unsupported scoring prediction. The statement supplies metric weights, not these automatic scores | Do not quote predicted marks. Measure the submitted implementation |
| No public cloud is a mandatory interpretation | Contradicted by the supplied statement's express permission for cloud-hosted open-weight models during SIH | Keep local Qwen as demonstrated deployment; any hosted option needs separate configuration, trust and validation |
| Grok 4.5 satisfies the open-weight requirement | No downloadable weights/license evidence supplied for that exact model | Do not replace the verified Qwen configuration based on the transcript |
| Air gap is just a planner-URL change | Incomplete operational claim | Require packaged dependencies/models, network isolation and a complete offline run before making an air-gap claim |
| One action → observe again → verify progress | Useful design requirement; transcript implementation unverified | Prioritize a bounded goal loop with cancellation and explicit completion evidence |
| Fuzzy retarget and retry another control after a miss | Can execute the wrong action after page changes | Revoke stale targets; capture and plan again. Do not turn a failed authorization into a fuzzy click |
| Type-preserving local references | Established prior art with potential utility for sensitive-value tasks | Design session-scoped local value references; do not expose raw values or globally stable unsalted value hashes |
| Five named agents prove multi-agent coordination | Names and a stage strip do not prove independent agents | Describe actual pipeline stages. Add model agents only where measured benefit justifies their cost |
| `host_permissions` alone proves no egress | Insufficient; Chrome distinguishes extension and content-script request contexts | Keep fixed endpoints, sender/message checks, CSP and payload validation; add runtime network evidence |
| VEIL 90–95%, 73%, 12/12, or DRISHTI 72.1% and 94 ms | Unverified alternative-system reports with different scopes/denominators | Never transfer these to Sightline's benchmark ledger or slides |
| Real YouTube/Amazon/Instagram capability from lab results or URL suffixes | Synthetic simulation and actual site execution are separate gates; route arrival is weak completion evidence | Test authorized synthetic targets; require observed task postconditions before success |
| ISRO systems impose the specific classification/data-diode restrictions listed | Much of the table is unsupported in the supplied material | Use hypothetical synthetic operations scenarios; do not claim access, endorsement, classified use or legal compliance |

The organizer text is already archived in [the official extract](../Raw/domain/sih26171-official-extract.txt). A fresh web fetch on 10 September returned an internal error; this review does not present that failed refresh as a second verification.

## Primary research checked

**CAPED — new addition.** Siyu Shen, Fenghao Xu, Wenrui Diao and Kehuan Zhang, arXiv:2606.12666v2, 16 June 2026. The paper evaluates task-aware pre-upload privacy exposure control for mobile GUI agents. Its discussion explicitly identifies a prototype fallback that treats unknown contexts as public and acknowledges the privacy cost. Adopt task-conditioned evaluation, but retain Sightline's conservative handling of unknown regions. Also test private information in the user's goal, not only the screenshot. This is related mobile research, not proof of browser accuracy. [Full paper](https://arxiv.org/html/2606.12666v2).

**Available but Invisible — already in our Wiki, now checked more closely.** Lepeng Zhao, Zhenhua Zou, Shuo Li and Zhuotao Liu, arXiv:2602.10139v3, 26 April 2026. It describes consistent pseudonyms across instructions, UI hierarchies and screenshots, mediated by a local interaction proxy. Its published deterministic placeholder formula hashes the raw value and type without a session secret. Our inference: small predictable value domains warrant dictionary/linkability analysis; prefer random session identifiers backed by a local map. This is an engineering precaution, not a demonstrated break of the paper. [Full paper](https://arxiv.org/html/2602.10139v3).

**WebPII — already used in our work.** Nathan Zhao, arXiv:2603.17357v1, 18 March 2026. Its synthetic e-commerce benchmark includes identifiers and partially filled forms. The author's model accuracy and CPU timing cannot substitute for our browser measurements. Our existing 100-screen diagnostic is separately documented and exposes loss of useful raster context. [Paper](https://arxiv.org/abs/2603.17357), [our diagnostic](../Docs/decisions/raster-evaluation.md).

## ISRO positioning correction

Bhoonidhi's official documentation provides authenticated STAC catalogue search and product-download APIs. This contradicts the broad implication that all catalogue retrieval must be done manually through a GUI. Our inference: a useful browser-agent pitch concerns privacy-preserving assistance across UI workflows where an appropriate API integration is unavailable or impractical. Include an API baseline where it exists; do not assume GUI automation is superior. This does not establish a stakeholder-validated need. [NRSC API specification](https://bhoonidhi.nrsc.gov.in/bhoonidhi-api/).

Bhoonidhi describes access/pricing distinctions around 5 m ground sampling distance. Those terms do not, by themselves, establish that every finer-resolution image or visible portal screen is classified, or that a particular AI workflow is prohibited. The transcript's MAITRI/Vicuna and data-diode assertions remain unverified; the focused official-domain search did not substantiate them. [Official registration terms](https://bhoonidhi.nrsc.gov.in/bhoonidhi/registration.html).

Chrome documents content-script requests as originating from the host web origin and warns against arbitrary URL requests passed to extension handlers. Restricted host permissions are one control, not a complete network-isolation proof. [Chrome request model](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests).

## Resulting priorities

1. Finish local raster OCR/PII evaluation, with detection errors and useful context measured separately.
2. Implement the bounded observe/plan/act/verify loop, preserving revision checks and manual handling of consequential actions.
3. Evaluate task-conditioned minimization and local value references across every outgoing channel before enabling richer tasks.
4. Build a clearly synthetic Earth-observation operations scenario; compare a stable API path where relevant.
5. Keep one SIH26171 product identity. VEIL and DRISHTI remain alternative reference implementations until their source and evidence are supplied.

Execution contracts and acceptance evidence: [reference-informed plan](../Docs/decisions/reference-informed-plan.md).
