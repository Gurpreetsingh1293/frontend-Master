from katalyst_analysis.squad_effectiveness import MemberSnapshot, compute_effectiveness


def test_squad_where_both_members_improve_is_fully_effective():
    snapshots = [
        MemberSnapshot("squad-1", "alice", "Algebra::quadratic_equations", 40, 58, "improving"),
        MemberSnapshot("squad-1", "bilal", "Geometry::triangles", 35, 50, "improving"),
    ]
    results, overall_rate = compute_effectiveness(snapshots)
    assert len(results) == 1
    assert results[0].all_members_improved is True
    assert results[0].members_improved == 2
    assert overall_rate == 1.0


def test_squad_where_one_member_does_not_improve_is_partially_effective():
    snapshots = [
        MemberSnapshot("squad-1", "alice", "Algebra::quadratic_equations", 40, 58, "improving"),
        MemberSnapshot("squad-1", "bilal", "Geometry::triangles", 35, 33, "declining"),
    ]
    results, overall_rate = compute_effectiveness(snapshots)
    assert results[0].all_members_improved is False
    assert results[0].members_improved == 1
    assert overall_rate == 0.0


def test_members_without_a_matched_gap_topic_are_excluded():
    snapshots = [
        MemberSnapshot("squad-1", "alice", None, 40, 58, "improving"),
        MemberSnapshot("squad-1", "bilal", "Geometry::triangles", 35, 50, "improving"),
    ]
    results, overall_rate = compute_effectiveness(snapshots)
    assert results[0].members_evaluated == 1
    assert overall_rate == 1.0


def test_overall_rate_across_multiple_squads():
    snapshots = [
        MemberSnapshot("squad-1", "a", "X::1", 40, 60, "improving"),
        MemberSnapshot("squad-1", "b", "Y::1", 40, 60, "improving"),
        MemberSnapshot("squad-2", "c", "X::1", 40, 40, "declining"),
        MemberSnapshot("squad-2", "d", "Y::1", 40, 60, "improving"),
    ]
    results, overall_rate = compute_effectiveness(snapshots)
    assert overall_rate == 0.5  # squad-1 fully effective, squad-2 not


def test_no_snapshots_yields_empty_report():
    results, overall_rate = compute_effectiveness([])
    assert results == []
    assert overall_rate == 0.0
