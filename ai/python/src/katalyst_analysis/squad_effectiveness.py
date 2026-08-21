"""Squad net-positive effectiveness metric (§15.6 of the build spec).

A squad match is only evidence of a *net positive* outcome if the gap topic
each member was matched in for help actually shows measurable movement
afterward. This script takes a before/after snapshot per squad member (the
Node side queries `student_topic_performance` at squad-formation time and
again 2-4 weeks later) and reports, per squad and overall, whether that
happened.

CLI:
    python -m katalyst_analysis.squad_effectiveness --input snapshots.json \\
        [--output report.json]

Input JSON: a list of objects:
    {
      "squad_id": "...",
      "user_id": "...",
      "matched_gap_topic": "Algebra::quadratic_equations",
      "accuracy_before": 42.0,
      "accuracy_after": 58.0,
      "trend_after": "improving"
    }
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class MemberSnapshot:
    squad_id: str
    user_id: str
    matched_gap_topic: str | None
    accuracy_before: float
    accuracy_after: float
    trend_after: str


@dataclass
class SquadEffectiveness:
    squad_id: str
    members_evaluated: int
    members_improved: int
    all_members_improved: bool
    avg_accuracy_delta: float


def _member_improved(snap: MemberSnapshot) -> bool:
    return snap.accuracy_after > snap.accuracy_before or snap.trend_after == "improving"


def compute_effectiveness(
    snapshots: list[MemberSnapshot],
) -> tuple[list[SquadEffectiveness], float]:
    by_squad: dict[str, list[MemberSnapshot]] = {}
    for s in snapshots:
        if s.matched_gap_topic is None:
            continue  # not a help-recipient in this squad for this topic — nothing to measure
        by_squad.setdefault(s.squad_id, []).append(s)

    results: list[SquadEffectiveness] = []
    for squad_id, members in by_squad.items():
        improved = [m for m in members if _member_improved(m)]
        deltas = [m.accuracy_after - m.accuracy_before for m in members]
        results.append(
            SquadEffectiveness(
                squad_id=squad_id,
                members_evaluated=len(members),
                members_improved=len(improved),
                all_members_improved=len(improved) == len(members),
                avg_accuracy_delta=round(sum(deltas) / len(deltas), 3) if deltas else 0.0,
            )
        )

    overall_rate = sum(1 for r in results if r.all_members_improved) / len(results) if results else 0.0
    return results, round(overall_rate, 4)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Compute squad net-positive effectiveness (§15.6).")
    parser.add_argument("--input", required=True, help="Path to before/after snapshot JSON.")
    parser.add_argument("--output", help="Path to write the report JSON. Defaults to stdout.")
    args = parser.parse_args(argv)

    with open(args.input, encoding="utf-8") as f:
        raw = json.load(f)
    snapshots = [MemberSnapshot(**r) for r in raw]

    results, overall_rate = compute_effectiveness(snapshots)
    report = {
        "squad_effectiveness_rate": overall_rate,
        "squads": [asdict(r) for r in results],
    }
    output_json = json.dumps(report, indent=2)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output_json)
    else:
        print(output_json)
    return 0


if __name__ == "__main__":
    sys.exit(main())
