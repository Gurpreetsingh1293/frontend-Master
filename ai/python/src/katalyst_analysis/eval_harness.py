"""AI Judge golden-set eval harness (§9 / §4.5 of the build spec).

The Node side runs the real AI Judge (packages/ai-judge) against a curated
set of submissions and dumps {true (human) levels, AI levels, XP} pairs to
JSON. This script scores agreement — it never calls the LLM itself, it only
analyzes already-produced output, which is what makes it a good fit as a
Python step in an otherwise-TS pipeline (nightly CI drift check, §9's
"golden-set eval for AI Judge" and §4.5's calibration sampling).

CLI:
    python -m katalyst_analysis.eval_harness --input golden_set_results.json \\
        [--min-agreement 0.8] [--output report.json]

Input JSON: a list of objects shaped like:
    {
      "case_id": "assignment-001",
      "true_levels": {"requirement_completion": "excellent", ...},
      "ai_levels": {"requirement_completion": "proficient", ...},
      "true_xp": 90,
      "ai_xp": 81
    }

Exit code is non-zero when overall_exact_match_rate < --min-agreement, so CI
can gate on it directly.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field


@dataclass(frozen=True)
class GoldenCase:
    case_id: str
    true_levels: dict[str, str]
    ai_levels: dict[str, str]
    true_xp: float
    ai_xp: float


@dataclass
class AgreementReport:
    cases_evaluated: int
    overall_exact_match_rate: float
    per_criterion_exact_match_rate: dict[str, float]
    xp_mean_absolute_error: float
    xp_max_absolute_error: float
    disagreements: list[dict] = field(default_factory=list)


def score_cases(cases: list[GoldenCase]) -> AgreementReport:
    if not cases:
        raise ValueError("No golden-set cases provided")

    total_criteria = 0
    matched_criteria = 0
    per_criterion_total: dict[str, int] = {}
    per_criterion_matched: dict[str, int] = {}
    xp_errors: list[float] = []
    disagreements: list[dict] = []

    for case in cases:
        criterion_keys = set(case.true_levels) | set(case.ai_levels)
        for key in criterion_keys:
            total_criteria += 1
            per_criterion_total[key] = per_criterion_total.get(key, 0) + 1
            true_level = case.true_levels.get(key)
            ai_level = case.ai_levels.get(key)
            if true_level == ai_level:
                matched_criteria += 1
                per_criterion_matched[key] = per_criterion_matched.get(key, 0) + 1
            else:
                disagreements.append(
                    {
                        "case_id": case.case_id,
                        "criterion_key": key,
                        "true_level": true_level,
                        "ai_level": ai_level,
                    }
                )
        xp_errors.append(abs(case.true_xp - case.ai_xp))

    per_criterion_rate = {
        key: per_criterion_matched.get(key, 0) / total for key, total in per_criterion_total.items()
    }

    return AgreementReport(
        cases_evaluated=len(cases),
        overall_exact_match_rate=round(matched_criteria / total_criteria, 4) if total_criteria else 0.0,
        per_criterion_exact_match_rate={k: round(v, 4) for k, v in per_criterion_rate.items()},
        xp_mean_absolute_error=round(sum(xp_errors) / len(xp_errors), 3),
        xp_max_absolute_error=round(max(xp_errors), 3),
        disagreements=disagreements,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Score AI Judge output against a human golden set (§9).")
    parser.add_argument(
        "--input", required=True, help="Path to golden-set result JSON (see module docstring)."
    )
    parser.add_argument("--output", help="Path to write the report JSON. Defaults to stdout.")
    parser.add_argument(
        "--min-agreement",
        type=float,
        default=0.8,
        help="Minimum overall_exact_match_rate required to exit 0 (for CI gating).",
    )
    args = parser.parse_args(argv)

    with open(args.input, encoding="utf-8") as f:
        raw = json.load(f)
    cases = [GoldenCase(**c) for c in raw]

    report = score_cases(cases)
    report_dict = {
        "cases_evaluated": report.cases_evaluated,
        "overall_exact_match_rate": report.overall_exact_match_rate,
        "per_criterion_exact_match_rate": report.per_criterion_exact_match_rate,
        "xp_mean_absolute_error": report.xp_mean_absolute_error,
        "xp_max_absolute_error": report.xp_max_absolute_error,
        "disagreements": report.disagreements,
    }
    output_json = json.dumps(report_dict, indent=2)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output_json)
    else:
        print(output_json)

    if report.overall_exact_match_rate < args.min_agreement:
        print(
            f"AI Judge drift check FAILED: {report.overall_exact_match_rate:.2%} "
            f"< required {args.min_agreement:.2%}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
