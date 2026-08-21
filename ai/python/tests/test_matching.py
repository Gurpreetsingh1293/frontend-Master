import json
from pathlib import Path

from katalyst_analysis.matching import build_skill_profiles, form_squads, reciprocity_score
from katalyst_analysis.models import TopicPerformance

FIXTURE_PATH = Path(__file__).parent.parent / "fixtures" / "topic_performance.json"


def load_records() -> list[TopicPerformance]:
    with open(FIXTURE_PATH, encoding="utf-8") as f:
        raw = json.load(f)
    return [TopicPerformance(**r) for r in raw]


def test_build_skill_profiles_classifies_strengths_and_gaps():
    records = load_records()
    profiles = build_skill_profiles(records)

    assert "Geometry::triangles" in profiles["alice"]["strengths"]
    assert "Algebra::quadratic_equations" in profiles["alice"]["gaps"]
    assert "Algebra::quadratic_equations" in profiles["bilal"]["strengths"]
    assert "Geometry::triangles" in profiles["bilal"]["gaps"]


def test_reciprocity_score_is_symmetric_and_counts_both_directions():
    records = load_records()
    profiles = build_skill_profiles(records)
    score = reciprocity_score(profiles["alice"], profiles["bilal"])
    assert score == 2  # alice covers bilal's gap, bilal covers alice's gap


def test_reciprocity_score_zero_for_unrelated_students():
    profiles = {
        "a": {"strengths": {"X::1"}, "gaps": {"Y::2"}},
        "b": {"strengths": {"Z::3"}, "gaps": {"W::4"}},
    }
    assert reciprocity_score(profiles["a"], profiles["b"]) == 0


def test_form_squads_pairs_reciprocal_students_together():
    records = load_records()
    squads, summary = form_squads(records)

    member_sets = [{m.user_id for m in squad.members} for squad in squads]
    assert {"alice", "bilal"} in member_sets
    assert {"chen", "diya"} in member_sets
    assert summary.squads_formed == 2
    assert summary.candidates_considered == 4
    assert summary.avg_reciprocity_score == 2.0


def test_form_squads_never_places_a_student_in_two_squads():
    records = load_records()
    squads, _ = form_squads(records)
    seen: set[str] = set()
    for squad in squads:
        for member in squad.members:
            assert member.user_id not in seen
            seen.add(member.user_id)


def test_form_squads_records_matched_strength_and_gap_topics():
    records = load_records()
    squads, _ = form_squads(records)

    alice_bilal_squad = next(s for s in squads if {m.user_id for m in s.members} == {"alice", "bilal"})
    alice_member = next(m for m in alice_bilal_squad.members if m.user_id == "alice")

    assert alice_member.matched_strength_topic == "Geometry::triangles"
    assert alice_member.matched_gap_topic == "Algebra::quadratic_equations"
    assert alice_member.role_in_squad == "both"


def test_priority_students_get_matched_even_with_zero_reciprocity_fallback():
    records = [
        TopicPerformance("solo", "Chemistry", "stoichiometry", 30, 3, "2026-08-01T00:00:00Z", "declining"),
        TopicPerformance("helper", "Chemistry", "stoichiometry", 92, 9, "2026-08-01T00:00:00Z", "stable"),
    ]
    squads, _ = form_squads(records, priority_user_ids=["solo"])
    assert len(squads) == 1
    assert {m.user_id for m in squads[0].members} == {"solo", "helper"}


def test_form_squads_empty_input_yields_no_squads():
    squads, summary = form_squads([])
    assert squads == []
    assert summary.squads_formed == 0
    assert summary.avg_reciprocity_score == 0.0
