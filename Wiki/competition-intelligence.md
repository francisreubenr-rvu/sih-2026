# SIH competition intelligence, 2022–2025

Research date: 2026-09-08. Scope: a purposive public-source sample, not a census or a statistical model of winning. Attribution and access records: `Raw/competition-sources.json`. Official event documentation outranks participant anecdotes. Neither a finalist photograph nor a college internal-round prize establishes a national win.

## Judging criteria and evidence confidence

The official SIH 2024 College SPOC guidelines identify the following idea-selection dimensions. The official PDF is indexed, but direct retrieval returned HTTP 403 during this research. Treat this as an official **historical** baseline, not a verified SIH 2026 weighted rubric. [SIH College SPOC guidelines](https://sih.gov.in/letters/Guidelines-College-SPOC.pdf)

| Historical dimension | Evidence the team should make inspectable | Interpretation |
|---|---|---|
| Novelty | A sourced competitor matrix and one demonstrable difference | A named, testable improvement; avoid unsupported “first ever” claims |
| Complexity | Explain the hardest implemented mechanism and its failure cases | Technical depth should earn its operational cost |
| Clarity and prescribed-format detail | Template-compliant submission plus a legible architecture | Judges can trace each requirement to a working feature |
| Feasibility and practicability | Running workflow, deployment recipe, data/input requirements | A student team can explain and maintain what it submits |
| Sustainability | Operating-cost assumptions, maintainers, support and adoption pathway | Present calculations as estimates until tested |
| Scale of impact | Target population, baseline, outcome metric and pilot design | Separate reach from achieved benefit |
| User experience | Task completion, keyboard behavior, recovery and mobile evidence | Interface appearance alone does not establish usability |
| Future progression | Bounded next milestone and concrete dependencies | A credible route from prototype to pilot |

The right-hand columns are this project's engineering interpretation. No official numerical weights, automatic ATS screening process, acceptance rate, or judge persuasion probability was verified. A third-party uploaded 2025 rubric was discovered but excluded as an authoritative scoring source because its provenance was insufficient. [Discovered upload](https://www.scribd.com/document/923519337/Rubrics-SIH-2025)

## Documented winner sample

| Year | Team / institution | Documented project or challenge | Provenance and confidence | Transferable inference |
|---|---|---|---|---|
| 2022 | Ellergy / Kumaraguru College of Technology | Compact electrical-energy storage, hardware edition | Institutional newsletter, printed page 21; winner explicitly stated. High confidence for award, no independently validated performance data. [KCT](https://kct.ac.in/wp-content/uploads/2023/12/Vol.-06-No.-01.pdf) | Frame a physical or operational constraint the solution addresses |
| 2023 | Hash Coders / VESIT | Jalshakti: community water-issue reports combined with open data and map display | Institutional newsletter, issue 92, printed page 6; winner and project in indexed excerpt. Medium-high confidence; PDF extraction was inconsistent. [VESIT](https://vesit.ves.ac.in/storage/updates/1724168594January-March%202024%20Newsletter.pdf) | Join a citizen action to a usable decision workflow |
| 2023 | Code Omega / D. J. Sanghvi College | SIH1283; national software-finale first prize | Institution-hosted winner PDF and certificate photograph. High confidence for win; no project-performance claim inferred. [DJSCE](https://www.djsce.ac.in/docs/SIH%20GRAND%20FINALE%202023_Winners.pdf) | Useful corroborating award evidence, insufficient for a product-pattern claim |
| 2024 | Solar Masters / Sir Padampat Singhania University | Single-axis solar tracker, SIH1731 | Problem sponsor's archive and winner interview. High confidence for win; technical outcomes remain team-reported. [MathWorks archive](https://www.mathworks.com/academia/students/competitions/hackathons/winners.html) | Show simulation, physical operation and monitoring as one traceable demonstration |
| 2025 | TwinX | Road-data conversion to simulation-ready traffic scenarios | Problem sponsor's winner archive. High confidence for award and stated topic; no independent benchmark found. [MathWorks archive](https://www.mathworks.com/academia/students/competitions/hackathons/winners.html) | Turn messy inputs into a specific usable output |
| 2025 | NYX / K J Somaiya School of Engineering | AI-assisted precise train-traffic control for section throughput, PS25022 | University's dated 9 December 2025 announcement. High confidence for award, not deployment or railway approval. [Somaiya](https://www.somaiya.edu/en/view-announcement/1026) | Articulate the operating decision and measurable bottleneck |

Additional code evidence: EdRank's own GitHub organization describes its 2022 UGC VS938 project as a winner and exposes web/mobile repositories. This is team-origin primary evidence about the repository; award status is self-reported and not promoted to independently verified. Repository availability says nothing about security, maintenance or actual usage. No competitor code was copied. [EdRank organization](https://github.com/edrank), [web repository](https://github.com/edrank/edrank_web)

## What the evidence supports

The strongest detailed case is Solar Masters. In a sponsor-hosted interview, the team describes problem decomposition, simulation, hardware work, monitoring applications, prototype demonstration, technical documentation and a video. The account also describes work before SIH and later plans for commercial development. Therefore, a polished contest prototype is not evidence of completed commercialization. Numerical efficiency claims in that interview are self-reported and should not become validation evidence for this project. [MathWorks winner account](https://blogs.mathworks.com/student-lounge/2025/06/13/innovation-meets-excellence-solar-masters-winning-journey-at-smart-india-hackathon-2024/?from=en)

Across the sample, **specific operational outcomes, inspectable artifacts and credible next steps** are useful design hypotheses. The sample cannot establish that these caused winning: it is small, selected through discoverability, dominated by institutional publicity and lacks losing-team controls. It also cannot establish that adding AI, blockchain, animation or more features increases selection probability.

For this entry, use a requirement → workflow → test → demonstration mapping. Show one complete case, one intentional failure, and the recovery. Explain what is deterministic, what is simulated, and what would require a real pilot. Prioritize implementation evidence over feature count.

## Platform coverage and gaps

| Requested channel | Work actually performed | Accepted evidence / limitation |
|---|---|---|
| LinkedIn | Public search and one public Solar Masters participant post opened | Participant account corroborates a sponsor-confirmed win; no private profiles or messages accessed. [Post](https://www.linkedin.com/posts/harshita-maratha-1122hm_solarmasters-sih2024-solarmasters-activity-7274448361305309184-NUi9) |
| Instagram | Public indexed searches for SIH winners and Solar Masters | No relevant source retrieved; coverage gap, not a claim that no posts exist |
| GitHub | Public EdRank organization and web repository reviewed at metadata/readme level | Repository evidence only; no code audit or execution |
| Reddit | Public participant discussion opened and evaluated | Anecdotal presentation advice; identities and selection claims unverified. [Discussion](https://www.reddit.com/r/developersIndia/comments/1ev3y2r/) |
| Facebook | Public domain-filtered searches | Returned irrelevant results; rejected, no relevant findings |
| WhatsApp channels | No channel content accessed | No known public relevant channel supplied or retrieved; private channels not harvested |
| News media | PIB 2022 finale release and a 2024 local-news search result reviewed | PIB distinguishes participants from named junior winner; do not relabel all featured teams as winners. [PIB](https://www.pib.gov.in/Pressreleaseshare.aspx?PRID=1854518&lang=2&reg=48) |
| Academic databases / repositories | Separate domain-research workstream | This competition sample does not substitute for technical literature or domain validation |

Collection was targeted public research, not exhaustive scraping of these platforms. No personal contacts, private-group data, photographs or copyrighted full articles were harvested. Short unchanged excerpts are retained in Raw; source links permit later rechecking.

## Preparation priorities through 11 September

1. Freeze one defensible problem interpretation and the supplied presentation structure; mark any edition mismatch visibly.
2. Finish the smallest complete workflow; preserve a known working dataset and a reset path.
3. Collect reproducible functional, latency, accessibility and recovery evidence. Record failed checks as failures.
4. Rehearse a timed demo, retain a local video fallback and make source citations readable.
5. Verify submission fields with the actual organizer-facing materials. The user-provided 11 September date is the working deadline; this research does not independently verify it as a national SIH deadline.

## Research limits

This document is sufficient to motivate a prototype evidence strategy; it is not a verified SIH 2026 rulebook. National current-year schedule, official scoring weights, exhaustive winners, deployed impact, complete social-platform coverage and a calibrated prediction of judge decisions remain unverified.
