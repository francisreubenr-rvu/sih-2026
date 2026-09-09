# RV University / SIH 2026 preparation pack

**NOT SUBMISSION READY. SIH2171 has not been matched to an authoritative problem statement.** This repository contains completed preparation work and a tested static preparation website. It does **not** contain a working domain prototype or a complete competition entry.

Internal target: 11 September 2026 (IST), supplied by Francis. Official deadline and current-year format are unverified.

## Hosted website

**Live:** https://francisreubenr-rvu.github.io/sih-2026/

**Repository:** https://github.com/francisreubenr-rvu/sih-2026

GitHub Pages publishes only the `Website` directory through `.github/workflows/pages.yml`. Pushes to `master` that change the website trigger deployment. The deployment result and verified URL are recorded in Docs/deployment-verification.md. Historical ZIP/PDF artifacts retain their original preparation status.

## Open first

- [Preparation brief](Docs/preparation-brief.pdf)
- [Problem identity evidence](Wiki/problem-statement.md)
- [Process documentation](Docs/process-documentation.pdf) and [editable Markdown](Docs/process-documentation.md)
- [Verification results](Docs/verification.md)
- [Machine-readable release status](Benchmarks/release-status.json)

## Deliverables

| Folder / file | What exists | Limit |
|---|---|---|
| Wiki | Cited competition intelligence, pitch strategy, identity research and source index | Domain literature/competitors blocked by unknown problem |
| Raw | Original supplied PPTX, preserved source archives, 31 source records and access limitations | Public targeted research, not exhaustive social scraping |
| Guardrails | 20 mandatory rules in JSON and explanatory Markdown | 1 pass, 1 fail, 18 unknown at delivery |
| Benchmarks | 11 KPI definitions in JSON/CSV, six Lighthouse reports, browser evidence and release checker | Domain and human measures remain unmeasured |
| Prototype | Explicit implementation/build contract | No working domain application |
| Docs/submission-blueprint.pptx and .pdf | Six-slide blueprint derived from supplied template | Not a completed idea; 2025 graphics inherited |
| Docs/expanded-pitch-blueprint.pptx and .pdf | 15-slide editable pitch blueprint with speaker notes | Evidence slots pending; 700 seconds planned, not rehearsed |
| Website | Responsive static preparation dossier with interactive architecture and timeline | Verified GitHub Pages hosting; no real domain demo, team photos or contact endpoint |
| Docs | Process, design audit, architecture decisions, team plan, impact model and demo runbook | Planned work distinguished from performed work |

## Run the website

```sh
python3 -m http.server 4173 --directory Website --bind 127.0.0.1
```

Open http://127.0.0.1:4173 . No install or build step is required. The site has local scripts/assets and no data collection. Full-page review captures are in Docs/website-desktop.jpg and Docs/website-mobile.jpg.

## Run verification

```sh
python3 scripts/check_release.py
python3 scripts/check_artifacts.py
python3 scripts/run_lighthouse.py
```

The release checker intentionally exits 1 while the entry is failed/unknown. It aggregates recorded reviews and evidence presence; it cannot certify correctness by itself. Artifact checks are structural. Lighthouse requires Node/npm and Chrome; it obtains pinned Lighthouse 12.8.2 from npm and uses the running local server. The domain under-200ms core-flow test has not run.

Final local Lighthouse medians: performance 100, accessibility 100, best practices 100, SEO 100 on mobile and desktop. GitHub Pages hosting was verified separately after these local audits. Human testing, full WCAG conformance and benchmark saturation are not established.

## Rebuild documents

Python scripts use `python-pptx` and `reportlab`; the desktop workspace's bundled Python has both. Run scripts/build_submission.py, scripts/build_pitch.py and scripts/build_documents.py with that environment. LibreOffice exports the PPTX files to PDF. The submission generator retains the original supplied template and removes its seventh instruction slide; the expanded generator creates original editable shapes.

## Unblock the actual entry

Preserve an organiser-issued statement establishing exact ID/year, full description, sponsor, category, expected outputs and constraints. Then freeze domain requirements, research relevant literature and competitors, implement/test the core workflows, gather independent feedback, capture the actual demo, populate the deck and confirm registration/current submission rules. No nearby problem ID has been substituted.

Team: Gopreet, Hiranmayi, Varun, Koushaik, Francis, Niharika; second-year B.Tech CSE, RV University, as supplied. Role assignments are proposals. No award, expertise, photograph, partnership, quantitative impact or selection probability has been invented.
