"""check_release.py: subjects-based freshness and evidence status conflicts."""
import importlib.util
import pathlib

SPEC = importlib.util.spec_from_file_location(
    "check_release", pathlib.Path(__file__).resolve().parents[1] / "check_release.py")
check_release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(check_release)


def test_evidence_status_conflict_is_reported():
    rule = {"status": "pass", "required_evidence": ["Benchmarks/results/demo-rehearsal.json"]}
    assert check_release.evidence_status_conflicts(rule) == [
        {"path": "Benchmarks/results/demo-rehearsal.json", "evidence_status": "unknown"}]


def test_no_conflict_when_statuses_agree_or_file_has_none():
    assert check_release.evidence_status_conflicts(
        {"status": "unknown", "required_evidence": ["Benchmarks/results/demo-rehearsal.json"]}) == []
    assert check_release.evidence_status_conflicts(
        {"status": "pass", "required_evidence": ["Docs/security.md"]}) == []


def test_subjects_count_only_commits_touching_them():
    head = check_release.git("rev-parse", "HEAD")
    rule = {"required_evidence": [], "evidence_commit": head, "subjects": ["Website/"]}
    fresh = check_release.freshness(rule, head)
    assert fresh["commits_behind"] == 0
    assert fresh["subject_commits_since_evidence"] == 0
