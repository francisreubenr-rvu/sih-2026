#!/usr/bin/env bash
# One entry point for every local check (G03: reproducible workflow).
#
#   scripts/check-all.sh            run every suite from the repo root
#   scripts/check-all.sh --install  first install Prototype npm deps and Warden test deps
#
# Writes Benchmarks/results/setup-run-<UTC date>.json: tool versions, the commit,
# and pass/fail/skip per suite with its last summary lines. It never prints a key
# value and needs none: model-backed Warden tests skip without weights, and the
# cloud planner is not called. Exit status is non-zero if any suite failed.
#
# Needs: node 22+, python 3.11+, a Chromium for the extension tests
# (PLAYWRIGHT_BROWSERS_PATH, DHRISTI_CHROMIUM, or /usr/bin/google-chrome).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PY="${PYTHON:-python3}"
LOG_DIR="$(mktemp -d)"
trap 'rm -rf "$LOG_DIR"' EXIT

if [[ "${1:-}" == "--install" ]]; then
  (cd Prototype && npm ci) || exit 1
  "$PY" -m pip install -q -r warden/requirements-test.txt || exit 1
fi

NAMES=()
STATUSES=()

run() {
  local name="$1"; shift
  local log="$LOG_DIR/$name.log"
  printf '%-22s ' "$name"
  if "$@" >"$log" 2>&1; then
    STATUSES+=("pass"); echo "pass"
  else
    STATUSES+=("fail"); echo "FAIL (log tail below)"; tail -15 "$log" | sed 's/^/    /'
  fi
  NAMES+=("$name")
}

run prototype        bash -c 'cd Prototype && npm run test:ci'
run g11-harness      node --test scripts/g11-warden-option-c-harness.test.mjs
run extension        bash -c 'node --test extension/utils/loopback.test.mjs extension/tests/*.test.mjs'
run warden           bash -c 'cd warden && WARDEN_PAIRING_DISABLED=1 '"$PY"' -m pytest -q -rs test_warden.py test_pii_layers.py'
run script-tests     "$PY" -m pytest -q scripts/tests
run signal-tokens    node scripts/check-signal-tokens.mjs
run no-em-dash       node scripts/check-no-em-dash.mjs
# check_release.py exits 1 while gates fail or are unknown; what must hold is that
# the committed ledger matches what it would write.
run ledger           bash -c "$PY"' scripts/check_release.py --dry-run | '"$PY"' -c "import json,sys; sys.exit(0 if json.load(sys.stdin)[\"committed_ledger_matches\"] else 1)"'

OUT="Benchmarks/results/setup-run-$(date -u +%Y-%m-%d).json"
NAMES_CSV="$(IFS=,; echo "${NAMES[*]}")"
STATUSES_CSV="$(IFS=,; echo "${STATUSES[*]}")"
LOG_DIR="$LOG_DIR" NAMES_CSV="$NAMES_CSV" STATUSES_CSV="$STATUSES_CSV" OUT="$OUT" "$PY" - <<'EOF'
import json, os, platform, subprocess, datetime, pathlib, re
def sh(*a):
    try:
        return subprocess.run(a, capture_output=True, text=True, timeout=30).stdout.strip()
    except Exception:
        return None
names = os.environ["NAMES_CSV"].split(",")
statuses = os.environ["STATUSES_CSV"].split(",")
suites = []
for name, status in zip(names, statuses):
    log = pathlib.Path(os.environ["LOG_DIR"], f"{name}.log").read_text(errors="replace").splitlines()
    summary = [l for l in log if re.search(r"(^# (tests|pass|fail|skipped) )|passed|failed|violations|committed_ledger", l)][-6:]
    suites.append({"name": name, "status": status, "summary": summary})
record = {
    "name": "setup-run",
    "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "commit": sh("git", "rev-parse", "HEAD"),
    "dirty": bool(sh("git", "status", "--porcelain", "--untracked-files=no")),
    "tools": {"node": sh("node", "--version"), "python": platform.python_version(), "os": platform.platform()},
    "scope": ("Local suites only: unit tests, real-Chromium extension tests, Warden pytest without model "
              "weights unless installed, token and em-dash checks, ledger consistency. No cloud planner, "
              "no loaded-extension end-to-end run, no toolbar gesture."),
    "suites": suites,
    "all_passed": all(s == "pass" for s in statuses),
}
pathlib.Path(os.environ["OUT"]).write_text(json.dumps(record, indent=2) + "\n")
print("wrote", os.environ["OUT"])
EOF

for s in "${STATUSES[@]}"; do [[ "$s" == "pass" ]] || exit 1; done
exit 0
