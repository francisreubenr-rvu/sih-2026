# ARCH — G11 core flow under Option C (measurement plan)

**Task:** GATE-VERIFY-001 / Architect slice  
**Date:** 2026-09-23  
**Lane:** Personal / SIH26171 Dhristi  
**Authority:** Francis Option C lock · `Docs/decisions/brain-option-c-warden-port.md` · existing G11 ledger (`Benchmarks/results/core-latency.json`, release-status)  
**Non-claims:** Does **not** flip G11, does **not** flip `submission_ready`, does **not** invent timings.

---

## 1. Frozen “core flow” (Option C)

| Role | Surface | Port | Counts as G11 full-flow? |
|---|---|---|---|
| **Frozen shipping core** | Root `extension/` (side panel) talking to **Warden** loop **PERCEIVE → STRIP → PLAN → VALIDATE → EXECUTE** | Warden `127.0.0.1:8756` | **Yes** — this is the only Option C surface that may be labeled “core flow” for a new G11 run |
| Measurement / HUD / historical | Master `Prototype/` (+ `Prototype/extension` popup) | Prototype `127.0.0.1:9041` | **No** — keep for compare/HUD/demo; never redefine as the shipping core after Option C |
| Privacy-only / skip-LLM | Any local protect path that omits PLAN (+ confirm/execute as required by full-flow) | n/a | **No** — may be reported as a separate lane; must not be scored as G11 pass |

**Decision (locked for measurement):** Under Option C, G11’s frozen core flow is **root extension + Warden on 8756**, end-to-end through EXECUTE (with F17 client `opTierLocal` still mandatory before unattended execute). Prototype protect on **9041** is **not** that frozen core.

Do not load `Prototype/extension` and score the Warden (two-build trap). Do not move Warden onto 9041.

---

## 2. Ports (unchanged)

| Port | Owner |
|---|---|
| `127.0.0.1:8756` | Warden only |
| `127.0.0.1:9041` | Prototype server / capture harness only |

---

## 3. What “full-flow” means for the new run

Reuse the **existing G11 acceptance rule** (do not weaken):

- **Budget:** p95 end-to-end **&lt; 200 ms** (unchanged).
- **Sample:** **n ≥ 100** after **10 warmups**.
- **Includes:** model + network + action on the frozen core (perceive/capture → strip → plan → validate → execute path as wired), not protect-only microbenchmarks.
- **Honesty already on master:** privacy-only local ms and Node selective-redaction microbenches are **not** a G11 pass; historical planner-inclusive samples (~3029 ms p95, small n) stay **fail** until replaced by a qualifying run.

**Planner honesty (Phase 1):** Phase 1 lock is **Ollama-default** for `/plan`. Imported Warden still uses **Groq** on `POST /plan` until a follow-up lands. Any new run must **label the planner** in the results file (`planner: groq` vs `planner: ollama@127.0.0.1:11434`). Prefer running the **gate-claim** suite **after** Ollama is `/plan` default; a Groq-labeled run is evidence for the import-as-is stack only and must not be narrated as Phase-1-complete.

---

## 4. Honest measurement plan (no pass claim)

### 4.1 Artifact

- Write a **new** results object (do not silently overwrite historical meaning), e.g. `Benchmarks/results/core-latency-warden-option-c.json`, and point release-status G11 `evidence` at it only when Verifier agrees the run matches this freeze.
- Keep `Benchmarks/results/core-latency.json` as the **pre–Option C / Prototype-line** ledger unless Brain explicitly asks for a merge note that links both.

### 4.2 Preconditions (checklist, evidence-gated)

1. Warden bound **only** on `127.0.0.1:8756`.
2. Root `extension/` loaded as the **only** extension under test for this suite.
3. Planner label recorded (`groq` | `ollama`); Ollama host if used.
4. F17: client `opTierLocal` path active; do not trust server `requiresConfirmation` alone.
5. No Prototype popup in the same Chromium profile as the scoring build.

### 4.3 Lanes (report separately)

| Lane ID | What is timed | May flip G11? |
|---|---|---|
| `L0_strip_local` | PERCEIVE+STRIP (or equivalent local strip) only | No |
| `L1_plan_validate` | Through PLAN+VALIDATE, no EXECUTE | No (diagnostic) |
| `L2_full_core` | Full frozen core through EXECUTE | **Only lane that can change G11**, and only if p95&lt;200, n≥100, warmups=10, planner labeled |

### 4.4 Procedure (Worker/Tester; Architect does not run)

1. 10 warmups discarded.
2. ≥100 timed `L2_full_core` attempts on a fixed page set (name URLs in the results file; no invented pages).
3. Record per-attempt stage breakdown: perceive, strip, plan, validate, execute, total.
4. Compute min/p50/p95/mean for `L2_full_core` total ms.
5. Gate object: `budgetMs: 200`, `status: pass|fail` from **that** distribution only.
6. Verifier black-box: compare ledger vs this file; **KEEP fail** unless L2 meets rule.

### 4.5 Explicit non-flips

- Do **not** set G11 pass from `L0` / privacy-only / Prototype 9041 timings.
- Do **not** set `submission_ready` true from this plan alone.
- Do **not** weaken `FULL_FLOW_LATENCY_MS` / 200 ms.
- A run with `planner: groq` after Phase 1 Ollama lock is **valid evidence for stack-as-imported**, not proof that Phase 1 planner lock is satisfied.

---

## 5. What would flip G11 (for Verifier / PM)

**KEEP fail** until all are true in evidence:

1. Frozen surface = root extension + Warden `8756` (documented in results).
2. Lane `L2_full_core`, n≥100, 10 warmups, p95 &lt; 200 ms.
3. Planner field present and matches the stack Francis accepts for the claim (prefer Ollama-default once Worker follow-up lands).
4. Verifier adopts the new evidence path into release-status.

Until then: **verdict KEEP** on current fail; Prototype 9041 and privacy-only remain non-claiming.

---

## 6. Handoff

- **Brain:** synthesize with Verifier table + PM next-goal pack.  
- **Worker:** implement harness only when Brain briefs (evidence-gated).  
- **Tester:** run suite + report pass/fail numbers; no architecture rewrite.  
- **Architect:** design-only here; no production code in this note.
