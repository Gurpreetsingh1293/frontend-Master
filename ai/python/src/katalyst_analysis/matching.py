"""Complementary-skill squad matching (§15.3 of the build spec).

Pairs/groups students so each member is strong exactly where another member
in the squad has a gap, and vice versa — a reciprocal, net-positive match
rather than one-directional tutoring. Pure stdlib, no optimization library
needed at cohort scale.

CLI:
    python -m katalyst_analysis.matching --input topic_performance.json \\
        [--priority user-1,user-2] [--max-size 4] [--output squads.json]

Input JSON: a list of TopicPerformance-shaped records (see models.py),
matching the `student_topic_performance` table (§2) field-for-field.
Output JSON: {"squads": [...], "run_summary": {...}}, matching
`study_squads` / `squad_members` / `squad_match_runs` (§15.2).
"""

from __future__ import annotations

import argparse
import json
import sys
import uuid
from dataclasses import asdict
from itertools import combinations

from katalyst_analysis.models import MatchRunSummary, SquadMember, StudySquad, TopicPerformance

STRENGTH_MIN_ACCURACY = 75.0
GAP_MAX_ACCURACY = 50.0
DEFAULT_MAX_SQUAD_SIZE = 4
DEFAULT_MIN_SQUAD_SIZE = 2


def build_skill_profiles(records: list[TopicPerformance]) -> dict[str, dict[str, set[str]]]:
    """One profile per user_id: {"strengths": {topic_key, ...}, "gaps": {topic_key, ...}}."""
    profiles: dict[str, dict[str, set[str]]] = {}
    for r in records:
        profile = profiles.setdefault(r.user_id, {"strengths": set(), "gaps": set()})
        if r.accuracy_pct >= STRENGTH_MIN_ACCURACY and r.trend in ("stable", "improving"):
            profile["strengths"].add(r.topic_key)
        if r.accuracy_pct < GAP_MAX_ACCURACY or r.trend == "declining":
            profile["gaps"].add(r.topic_key)
    return profiles


def reciprocity_score(profile_a: dict[str, set[str]], profile_b: dict[str, set[str]]) -> int:
    """§15.3 step 2 — count of topics each side's strength covers for the other's gap."""
    a_helps_b = len(profile_a["strengths"] & profile_b["gaps"])
    b_helps_a = len(profile_b["strengths"] & profile_a["gaps"])
    return a_helps_b + b_helps_a


def _uncovered_gaps(profiles: dict[str, dict[str, set[str]]], member_ids: list[str]) -> set[str]:
    all_gaps: set[str] = set()
    all_strengths: set[str] = set()
    for uid in member_ids:
        all_gaps |= profiles[uid]["gaps"]
        all_strengths |= profiles[uid]["strengths"]
    return all_gaps - all_strengths


def form_squads(
    records: list[TopicPerformance],
    priority_user_ids: list[str] | None = None,
    max_size: int = DEFAULT_MAX_SQUAD_SIZE,
) -> tuple[list[StudySquad], MatchRunSummary]:
    profiles = build_skill_profiles(records)
    candidates = list(profiles.keys())
    priority = [u for u in (priority_user_ids or []) if u in profiles]

    pair_scores = {
        (a, b): reciprocity_score(profiles[a], profiles[b]) for a, b in combinations(candidates, 2)
    }

    placed: set[str] = set()
    squads: list[StudySquad] = []
    seed_scores: list[int] = []

    def best_partner_for(uid: str, allow_zero: bool) -> str | None:
        best_id, best_score = None, -1
        for other in candidates:
            if other == uid or other in placed:
                continue
            score = pair_scores.get((uid, other)) or pair_scores.get((other, uid)) or 0
            if score > best_score:
                best_id, best_score = other, score
        if best_id is None:
            return None
        if best_score <= 0 and not allow_zero:
            return None
        return best_id

    def seed_squad(a: str, b: str) -> StudySquad:
        squad = StudySquad(
            id=str(uuid.uuid4()),
            subject="",
            topic="",
            status="proposed",
            formed_by="system_match",
            members=[],
        )
        for uid in (a, b):
            placed.add(uid)
        seed_scores.append(pair_scores.get((a, b)) or pair_scores.get((b, a)) or 0)
        squad_members_ids = [a, b]
        grow_squad(squad_members_ids, max_size)
        squad.members = _build_member_records(squad_members_ids, profiles)
        squad.subject, squad.topic = _pick_squad_focus(squad_members_ids, profiles)
        return squad

    def grow_squad(member_ids: list[str], cap: int) -> None:
        while len(member_ids) < cap:
            uncovered = _uncovered_gaps(profiles, member_ids)
            if not uncovered:
                break
            best_candidate, best_coverage = None, 0
            for other in candidates:
                if other in placed or other in member_ids:
                    continue
                coverage = len(profiles[other]["strengths"] & uncovered)
                if coverage > best_coverage:
                    best_candidate, best_coverage = other, coverage
            if best_candidate is None:
                break
            member_ids.append(best_candidate)
            placed.add(best_candidate)

    # 1. Priority (explicit help-request) students get matched first, falling back
    #    to a one-directional match if no reciprocal partner exists (§15.4).
    for uid in priority:
        if uid in placed:
            continue
        partner = best_partner_for(uid, allow_zero=False) or best_partner_for(uid, allow_zero=True)
        if partner is None:
            continue
        squads.append(seed_squad(uid, partner))

    # 2. Remaining candidates, strictly reciprocal pairs only, highest score first.
    for (a, b), score in sorted(pair_scores.items(), key=lambda kv: kv[1], reverse=True):
        if score <= 0:
            break
        if a in placed or b in placed:
            continue
        squads.append(seed_squad(a, b))

    avg_reciprocity = sum(seed_scores) / len(seed_scores) if seed_scores else 0.0
    summary = MatchRunSummary(
        candidates_considered=len(candidates),
        squads_formed=len(squads),
        avg_reciprocity_score=round(avg_reciprocity, 3),
    )
    return squads, summary


def _pick_squad_focus(member_ids: list[str], profiles: dict[str, dict[str, set[str]]]) -> tuple[str, str]:
    uncovered_or_covered = set()
    for uid in member_ids:
        uncovered_or_covered |= profiles[uid]["gaps"]
    if not uncovered_or_covered:
        return "", ""
    topic_key = sorted(uncovered_or_covered)[0]
    subject, topic = topic_key.split("::", 1)
    return subject, topic


def _build_member_records(
    member_ids: list[str], profiles: dict[str, dict[str, set[str]]]
) -> list[SquadMember]:
    members: list[SquadMember] = []
    for uid in member_ids:
        others_gaps: set[str] = set()
        others_strengths: set[str] = set()
        for other in member_ids:
            if other == uid:
                continue
            others_gaps |= profiles[other]["gaps"]
            others_strengths |= profiles[other]["strengths"]

        strength_topic = next(iter(profiles[uid]["strengths"] & others_gaps), None)
        gap_topic = next(iter(profiles[uid]["gaps"] & others_strengths), None)

        if strength_topic and gap_topic:
            role = "both"
        elif strength_topic:
            role = "offering_help"
        elif gap_topic:
            role = "seeking_help"
        else:
            role = "both"

        members.append(
            SquadMember(
                user_id=uid,
                role_in_squad=role,
                matched_strength_topic=strength_topic,
                matched_gap_topic=gap_topic,
            )
        )
    return members


def _squad_to_dict(squad: StudySquad) -> dict:
    d = asdict(squad)
    return d


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Form complementary-skill study squads (§15.3).")
    parser.add_argument("--input", required=True, help="Path to a JSON array of topic-performance records.")
    parser.add_argument("--output", help="Path to write result JSON. Defaults to stdout.")
    parser.add_argument(
        "--priority", default="", help="Comma-separated user_ids that requested help (§15.4)."
    )
    parser.add_argument("--max-size", type=int, default=DEFAULT_MAX_SQUAD_SIZE)
    args = parser.parse_args(argv)

    with open(args.input, encoding="utf-8") as f:
        raw = json.load(f)
    records = [TopicPerformance(**r) for r in raw]
    priority_ids = [u.strip() for u in args.priority.split(",") if u.strip()]

    squads, summary = form_squads(records, priority_user_ids=priority_ids, max_size=args.max_size)

    result = {
        "squads": [_squad_to_dict(s) for s in squads],
        "run_summary": asdict(summary),
    }
    output_json = json.dumps(result, indent=2)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output_json)
    else:
        print(output_json)
    return 0


if __name__ == "__main__":
    sys.exit(main())
