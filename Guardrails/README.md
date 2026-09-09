# Guardrails — release rules

**Current disposition: NOT SUBMISSION READY.** SIH2171 identity is unverified. The proposed rules below do not validate the problem, its eligibility, the deadline or a prototype. `guardrails.json` is the machine-readable source of truth; its current results are a failed identity check and unknown implementation checks.

## Decision rule

| State | Meaning | Consequence |
|---|---|---|
| Pass | Current evidence satisfies the entire criterion. | Continue. |
| Fail | Evidence establishes a violation. | Reject the candidate; repair and retest. |
| Unknown | Evidence is absent, incomplete, stale or collected on another version. | Block readiness claims and collect evidence. |

All rules are mandatory. Overall PASS requires every rule to pass. Any fail makes the overall result FAIL; otherwise any unknown makes it UNKNOWN. A high score cannot compensate for a failed security, source, accessibility or performance requirement. Preparation files may still be delivered with visible limitations; that does not mean the competition entry is ready.

## Scope and feasibility

This is a six-person second-year B.Tech team with a user-supplied 11 September 2026 target. Team experience, daily hours, official registration eligibility and official deadline have not been verified. Use one complete user journey, a small number of services and a proven data store after the actual problem is known. The ceiling of two application services, one database and one optional provider is a self-imposed complexity limit, not an SIH rule. A specialty hardware or custom-model plan is outside this deadline unless already available and validated.

A production-ready README is achievable for a prototype. A production-certified system, national deployment and proven social impact are separate outcomes and may not be implied by packaging quality.

## Performance measurement contract

The user's core-flow requirement is strict: **p95 <200ms**, not merely a sub-200ms API response or instant spinner. Freeze what each core action must accomplish, measure browser action through visible usable result, and include persistence when the action promises a save. Use 10 warmups and at least 100 measured attempts per core flow on an explicitly recorded local reference setup. Report remote network and cold-start times separately; local success is not proof of public internet response times.

External operations may require asynchronous jobs. Their acceptance latency and full completion latency must both be published. Do not rename a slow completion operation to evade the requirement. If an essential domain operation cannot meet the requirement, record failure and the actual trade-off.

For the website, all four Lighthouse categories on both mobile and desktop must be **strictly above 90** using the median of three clean runs. A score of 90 fails. Store raw reports, profile settings and versions. This threshold is user-defined, not a Chrome guarantee. [Chrome scoring documentation](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring).

## Accessibility and security

Use a criterion-level [WCAG 2.1 AA](https://www.w3.org/TR/WCAG21/) review with manual keyboard and assistive-technology checks in addition to automated testing. Contrast minimums: 4.5:1 ordinary text, 3:1 large text and required graphical/control boundaries. A practical 44px control target is a project choice, not a claim that WCAG 2.1 AA universally mandates that size. Reduced motion is a project requirement; avoid conflating every motion preference with an AA criterion.

Security checks cover server validation, authorization when data is private, safe query/output handling, bounded writes and requests, production transport, secrets and dependency findings. The [OWASP ASVS project](https://owasp.org/www-project-application-security-verification-standard/) informs the approach; this selected subset is not an ASVS certification. Public demonstrations should use synthetic data and disclose that status.

## Differentiation and social impact

Compare three relevant alternatives after verifying the domain. Implement and demonstrate at least one meaningful difference against a stated baseline. Absence of a feature in a quick web search does not prove a moat.

An impact model must name the beneficiary, unit, denominator, baseline, observation period and counterfactual. Illustrative formula: `annual time saved = eligible users × adoption fraction × actions per user × minutes saved per action`. Populate inputs only from evidence or label low/base/high assumptions. Do not equate registrations with improved outcomes, or multiply hypothetical adoption into a reported observed benefit. Also identify exclusion, error and privacy harms.

## Iteration and saturation

1. Freeze the problem, critical cases, benchmark definitions and reference environment.
2. Build a candidate and collect evidence; record failures with symptom, cause, correction and retest.
3. Reject any failed or unknown guardrail. Prioritize source validity and critical flows before cosmetic gains.
4. Saturation requires all mandatory rules and objective targets to pass, real human evaluation, and two consecutive evaluated iterations with under two percentage points improvement in each composite quality score and under 5% relative latency improvement, with no new critical failure.
5. Deadline exhaustion is not saturation. If unresolved, deliver the candidate as incomplete with a precise gap list. Never lower the targets retrospectively to manufacture a pass.

Human-only benchmarks cannot be populated by an AI impersonating reviewers. Rehearsal by the six authors is useful but must be labeled separately from independent validation.
