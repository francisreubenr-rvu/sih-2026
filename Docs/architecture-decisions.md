# Architecture decisions

Status: provisional design, no domain app implemented. Author: AI engineering lead; review date 8 September 2026.

## ADR-001 — Validate the problem before choosing a product

Decision: treat exact problem identity as a mandatory dependency. SIH2171 has no verified match in the examined sources. No invented title, similar-ID substitution or generic full-stack application will be passed off as the requested solution. This protects relevance, technical feasibility and judge credibility. Cost: domain work is blocked. Reopen when authoritative full text is available.

## ADR-002 — Prefer one deployable service for a short-deadline web prototype

Conditional recommendation: TypeScript UI and Node.js API, with SQLite for one local demo process or Postgres for shared deployment. Shared types, simple install, parameterised data access and deterministic seed data make a three-day student delivery easier to explain and reproduce. These support clarity, feasibility and practicability; they do not confer novelty.

| Alternative | Useful when | Reason to defer |
|---|---|---|
| Python/FastAPI | Scientific, ML or GIS libraries define the core solution | Unknown domain; two-language stack adds coordination |
| Next.js + managed Postgres | SSR or authenticated shared hosted workflows matter | Hosting/auth/provider complexity unnecessary until specified |
| React/Vite + Node | Conventional interactive web workflows | Preferred conditional starting point; not yet implemented |
| Microservices | Independent scale or isolation requirements are demonstrated | Extra deployment and debugging overhead |
| LLM agent | A measured evaluation proves benefit over rules/search | Latency, cost and hallucinations must earn their place |
| Blockchain | Multiple independent distrustful writers need shared consensus | Audit trail alone does not require it |

## ADR-003 — Static preparation website

Decision: semantic HTML, local CSS and small local JavaScript. The delivered website explains readiness, sources, team ownership and required evidence. It does not imply a live solution. Native details elements support keyboard access without framework overhead. Local assets and no third-party runtime calls keep it available during unreliable network conditions. Do not add a contact form until an owned destination and handling policy exist.

## ADR-004 — Evidence rather than claimed judge probability

No labelled judging-outcome dataset exists for calibration. Use a readiness proxy with a defined checklist and named rater; leave persuasion probability null. Projected impact must include assumptions, baseline, unit, uncertainty and a validation plan. Do not display projected benefits as measured outcomes.

## ADR-005 — Two decks

Maintain a six-slide submission blueprint based on the exact supplied PPTX and a separate 15-slide expanded pitch blueprint. The supplied document is dated 2025; verify 2026 acceptance separately. Export PDFs without implying these placeholders are submission ready.
