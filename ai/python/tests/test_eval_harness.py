import json
from pathlib import Path

import pytest

from katalyst_analysis.eval_harness import GoldenCase, score_cases

FIXTURE_PATH = Path(__file__).parent.parent / "fixtures" / "golden_set.json"


def load_cases() -> list[GoldenCase]:
    with open(FIXTURE_PATH, encoding="utf-8") as f:
        raw = json.load(f)
    return [GoldenCase(**c) for c in raw]


def test_score_cases_computes_overall_agreement():
    report = score_cases(load_cases())
    assert report.cases_evaluated == 3
    assert report.overall_exact_match_rate == pytest.approx(8 / 9, abs=1e-4)


def test_score_cases_per_criterion_breakdown():
    report = score_cases(load_cases())
    assert report.per_criterion_exact_match_rate["requirement_completion"] == pytest.approx(2 / 3, abs=1e-4)
    assert report.per_criterion_exact_match_rate["quality_accuracy"] == 1.0
    assert report.per_criterion_exact_match_rate["timeliness"] == 1.0


def test_score_cases_xp_error_stats():
    report = score_cases(load_cases())
    assert report.xp_mean_absolute_error == pytest.approx(8 / 3, abs=1e-3)
    assert report.xp_max_absolute_error == 8.0


def test_score_cases_records_disagreements():
    report = score_cases(load_cases())
    assert len(report.disagreements) == 1
    d = report.disagreements[0]
    assert d["case_id"] == "assignment-002"
    assert d["criterion_key"] == "requirement_completion"
    assert d["true_level"] == "proficient"
    assert d["ai_level"] == "excellent"


def test_score_cases_raises_on_empty_input():
    with pytest.raises(ValueError):
        score_cases([])


def test_perfect_agreement_scores_1_0():
    cases = [
        GoldenCase("c1", {"a": "excellent"}, {"a": "excellent"}, 100, 100),
        GoldenCase("c2", {"a": "developing"}, {"a": "developing"}, 50, 50),
    ]
    report = score_cases(cases)
    assert report.overall_exact_match_rate == 1.0
    assert report.xp_mean_absolute_error == 0.0
    assert report.disagreements == []
