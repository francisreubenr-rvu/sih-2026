"""Read-only source inventory and syntax checks at the audited commit.

Writes JSON to stdout, never evaluates project scripts or downloads dependencies.
Run from any directory: python Docs/audits/2026-10-03/inventory.py > /tmp/inventory.json
Requires Node and PyYAML, already available in the audit environment.
Manual-review labels are conservative: they describe focused review, not line coverage.
"""

import ast
import hashlib
import json
import subprocess
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[3]
BASE = "7c35778"
SOURCE = {
    ".py",
    ".js",
    ".mjs",
    ".html",
    ".css",
    ".yml",
    ".yaml",
    ".ipynb",
    ".sh",
    ".toml",
}
FOCUSED = {
    ".github/workflows/prototype-test.yml",
    ".github/workflows/warden-test.yml",
    ".github/workflows/pages.yml",
    ".github/workflows/no-em-dash.yml",
    "scripts/check_release.py",
    "scripts/check_artifacts.py",
    "scripts/build-delivery-manifest.py",
    "scripts/build-extension.mjs",
    "scripts/build-prototype.mjs",
    "scripts/check-no-em-dash.mjs",
    "scripts/check-signal-tokens.mjs",
    "scripts/g20_summarize.py",
    "scripts/laya/finetune.py",
    "scripts/laya/evaluate.py",
    "scripts/laya/score_blind.py",
    "scripts/laya-finetune/train_cpu.py",
    "scripts/laya-finetune/validate.py",
    "scripts/score-raster-benchmark.py",
    "scripts/score-text-benchmark.py",
    "scripts/wave3-security-scan.mjs",
    "scripts/wave6-hardening-evidence.mjs",
    "scripts/wave7-load-notes.mjs",
    "scripts/e2e-v5/run.mjs",
    "scripts/e2e-v5/recording-relay.mjs",
    "scripts/e2e-v5/fake-cloud.mjs",
    "scripts/measure-core-latency.mjs",
    "scripts/judge-fast-path.mjs",
    "scripts/benchmark-models.mjs",
    "scripts/cloud-models/llm_settings_bench.py",
    "scripts/g11-warden-option-c-lib.mjs",
    "scripts/g11-warden-option-c-harness.mjs",
    "scripts/fetch-ocr-pii-assets.py",
    "scripts/fetch-webpii-test100.py",
    "scripts/optimize-vision-model.py",
    "scripts/render_presentations.py",
    "scripts/run_lighthouse.py",
    "Website/index.html",
    "Website/style.css",
    "Prototype/extension/popup.mjs",
    "Prototype/extension/ort-sandbox.mjs",
    "Prototype/extension/content.mjs",
    "Prototype/app/main.mjs",
    "Prototype/app/task-loop.mjs",
    "Prototype/app/local-reference.mjs",
    "Prototype/app/text-preview.mjs",
    "Prototype/app/operations.mjs",
    "extension/tests/helpers/background-harness.mjs",
    "extension/tests/helpers/content-harness.mjs",
    "extension/tests/content-guard.test.mjs",
}
PATTERNS = {
    "blocking_http": "httpx.post(",
    "blocking_sleep": "time.sleep(",
    "fixed_wait": "setTimeout(",
    "legacy_startup": "@app.on_event(",
    "html_write": "innerHTML",
    "raw_json_request": "await request.json(",
    "developer_path": "/Volumes/",
    "raw_relay_logging": "appendFileSync(log, body",
    "artifact_overwrite": "writeFile(outPath",
}


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def js_check(text):
    p = subprocess.run(
        ["node", "--input-type=module", "--check"],
        input=text,
        text=True,
        capture_output=True,
    )
    return p.returncode == 0


class HTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.scripts = []
        self.current = None

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            a = dict(attrs)
            if "src" not in a and a.get("type", "").lower() in (
                "",
                "module",
                "text/javascript",
                "application/javascript",
            ):
                self.current = []

    def handle_data(self, data):
        if self.current is not None:
            self.current.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self.current is not None:
            self.scripts.append("".join(self.current))
            self.current = None


files = git("ls-tree", "-r", "--name-only", BASE).decode().splitlines()
rows, excluded, json_checks = [], [], []
for name in files:
    path = Path(name)
    if path.suffix == ".json":
        try:
            json.loads(git("show", f"{BASE}:{name}"))
            json_checks.append({"path": name, "parse": "pass"})
        except (ValueError, UnicodeError):
            json_checks.append({"path": name, "parse": "fail"})
    if path.suffix not in SOURCE:
        continue
    reason = None
    if name.startswith("Raw/"):
        reason = "downloaded research/data; not maintained application source"
    elif name.startswith("Prototype/models/") or name in (
        "Website/assets/gsap.min.js",
        "Website/assets/ScrollTrigger.min.js",
    ):
        reason = "vendored third-party runtime"
    elif name.startswith("Benchmarks/results/"):
        reason = "historical source snapshot or generated report; retain as evidence"
    if reason:
        excluded.append({"path": name, "reason": reason})
        continue
    raw = git("show", f"{BASE}:{name}")
    text = raw.decode()
    lines = text.splitlines()
    flags = []
    # This pass reads every line, including comments. Matches are review prompts, not bugs.
    for number, line in enumerate(lines, 1):
        for category, needle in PATTERNS.items():
            if needle in line:
                flags.append({"line": number, "category": category})
    checks = []
    try:
        if path.suffix == ".py":
            tree = ast.parse(text, filename=name)
            checks.append("python_ast:pass")
        elif path.suffix in (".js", ".mjs"):
            checks.append("node_syntax:" + ("pass" if js_check(text) else "fail"))
        elif path.suffix in (".yml", ".yaml"):
            yaml.safe_load(text)
            checks.append("yaml_parse:pass")
        elif path.suffix == ".html":
            parser = HTML()
            parser.feed(text)
            checks.append("html_tokenization:pass")
            checks.append(
                "inline_js_syntax:"
                + ("pass" if all(js_check(s) for s in parser.scripts) else "fail")
            )
        elif path.suffix == ".ipynb":
            notebook = json.loads(text)
            # IPython's transformer handles !, %, %% and notebook-specific syntax.
            from IPython.core.inputtransformer2 import TransformerManager

            transformer = TransformerManager()
            for index, cell in enumerate(notebook["cells"]):
                if cell["cell_type"] == "code":
                    ast.parse(transformer.transform_cell("".join(cell["source"])))
            checks.append("notebook_transformed_ast:pass")
        else:
            checks.append("line_scan_only:no_language_parser")
    except (SyntaxError, ValueError, ImportError, yaml.YAMLError) as error:
        checks.append("parse:fail:" + type(error).__name__)
    focused = (
        name in FOCUSED
        or (name.startswith("warden/") and name != "warden/test_warden.py")
        or (
            name.startswith("extension/")
            and "/tests/" not in name
            and path.suffix == ".js"
        )
        or name.startswith("Prototype/shared/")
        or name.startswith("Prototype/server/")
    )
    rows.append(
        {
            "path": name,
            "lines": len(lines),
            "sha256": hashlib.sha256(raw).hexdigest(),
            "automated_line_scan": "complete",
            "checks": checks,
            "manual_review": "focused_source_review" if focused else "not_claimed",
            "review_prompts": flags,
        }
    )
print(
    json.dumps(
        {
            "base_commit": git("rev-parse", BASE).decode().strip(),
            "tracked_paths": len(files),
            "summary": {
                "first_party_source_files": len(rows),
                "first_party_source_lines": sum(r["lines"] for r in rows),
                "focused_source_review_files": sum(
                    r["manual_review"] != "not_claimed" for r in rows
                ),
                "excluded_source_paths": len(excluded),
                "json_files_parsed": len(json_checks),
                "groups": dict(Counter(r["path"].split("/")[0] for r in rows)),
            },
            "limitations": [
                "Automated line scan is not manual semantic review of every line.",
                "Syntax checks do not execute models, scripts or deployment workflows.",
                "HTML tokenization is not accessibility or HTML conformance validation.",
                "CSS receives line scanning only; no rendering or CSS syntax claim.",
                "JSON parsing does not establish schema validity or source authenticity.",
            ],
            "files": rows,
            "excluded_source": excluded,
            "json_checks": json_checks,
        },
        indent=2,
    )
)
