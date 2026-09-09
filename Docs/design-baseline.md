# Design baseline and source audit

Recorded 8 September 2026. This is a proposed, original design system; the SIH2171 problem domain remains unverified.

## Evidence used

| Source | Established observation | Use in this project |
|---|---|---|
| [VoltAgent / awesome-design-md](https://github.com/VoltAgent/awesome-design-md) | The project structures design instructions around visual theme, color roles, typography, components, layout, depth, responsive behavior and constraints. | Use its documented-system approach rather than adopting a brand's entire look. |
| [Lando Norris homepage](https://landonorris.com/) | Its public page organizes identity, personal narrative, on/off-track content, product galleries and social links. Public CSS uses dark green, cream and lime with uppercase display typography. | Infer a transferable direction of decisive hierarchy, chapter rhythm, limited palette and personality. These are design interpretations, not claims about conversion or usability. |
| [WCAG 2.1](https://www.w3.org/TR/WCAG21/) | Accessibility conformance requires applicable success criteria, not a visual resemblance or one automated score. | Treat keyboard access, contrast, reflow, labels and status announcements as release requirements. |
| [Chrome Lighthouse scoring](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring) | Performance scoring depends on metric distributions and can vary between runs. | Preserve raw reports and environment; use repeated runs with strict >90 targets. |

The site's HTML and CSS were retrieved for source inspection, with URL and SHA-256 inventory in `Raw/design/archive-manifest.json`. This audit did not perform a live browser evaluation of the reference website. Archived third-party CSS/HTML are research evidence only and must not be served as application assets. No Lando Norris photographs, logos or fonts were downloaded for reuse.

## Taste application and conflict resolution

Applied the local `gpt-taste` skill at `/Users/maverick/.agents/skills/gpt-taste/SKILL.md`: wide display copy, varied editorial composition, clear contrast, restrained card count, coherent attention-to-action journey and generous chapter spacing.

The skill also suggests mandatory elaborate GSAP, low-opacity scroll text and random image services. Those suggestions conflict with the user's accessibility/performance requirements and the need for authentic team assets. The implementation baseline therefore uses progressive enhancement, optional restrained motion, full reduced-motion support and initials for missing portraits. A design skill is guidance, not evidence of measured usability. No simulated random output is represented as a real experiment.

## Original design decisions

| Decision | User need served | Test |
|---|---|---|
| Wide, short hero and single primary action | A judge understands status and next action immediately. | Five-second comprehension prompt; actual human responses pending. |
| Ruled evidence rows and expandable architecture | Inspect substance without navigating a presentation maze. | Keyboard inspection and timed findability tasks. |
| Paper reading surfaces with dark chapter bands | Distinct hierarchy with long-form legibility. | Contrast checks and 200% zoom review. |
| Lime only for selected action emphasis | Direct attention without competing signals. | Contrast audit in all states. |
| Real names with proposed roles, initials for images | Show accountable ownership without inventing credentials. | Compare each profile against team-supplied evidence. |
| Visible missing/problem-source status | Prevent an attractive shell from implying an entry exists. | Claim audit against research and implementation logs. |

## Information architecture

While SIH2171 is unverified: preparation status → research and evidence → delivery plan → proposed team responsibilities → artifacts and unresolved source requirement. Do not show a working-demo action without a working demo.

After verification and implementation: problem → solution → live demo → evidence → architecture → feasibility/impact → team → roadmap/contact. Keep source links near claims. Technical details belong in optional inspection panels and docs, not in every user's primary task flow.

## Validation checklist

- 390px and 1440px browser screenshots; 320px reflow and 200% zoom checks.
- Complete keyboard journey with visible focus and no trap.
- Motion off under reduced-motion preference, content still visible.
- Every interactive architecture element opens a correct description.
- Contrast measured on rendered colors, not token values alone.
- One human finds problem, demo/status, innovation, evidence and team responsibility without instruction.
- Contact flow tested for validation, successful persistence and actual delivery only if a destination is configured.
- All benchmark results remain `null` until evidence is recorded.

## Attribution boundary

The VoltAgent repository has an MIT license; an archived copy is in `Raw/design/voltagent-license.txt`. Its analyzed brands retain their identities. Lando Norris content is a visual reference; reproduction rights are not inferred from public access. The project tokens, layouts and implementation are original decisions.
