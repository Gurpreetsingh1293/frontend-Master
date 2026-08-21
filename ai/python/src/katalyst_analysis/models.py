"""Dataclasses mirroring the JSON shapes used across the platform.

Field names match packages/shared-types (TS) and §2's Postgres schema
exactly (snake_case) so JSON produced/consumed here needs no translation
layer when it crosses the Node/Python boundary.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

Trend = Literal["improving", "stable", "declining"]


@dataclass(frozen=True)
class TopicPerformance:
    user_id: str
    subject: str
    topic: str
    accuracy_pct: float
    attempts: int
    last_attempt_at: str
    trend: Trend

    @property
    def topic_key(self) -> str:
        return f"{self.subject}::{self.topic}"


@dataclass(frozen=True)
class SquadMember:
    user_id: str
    role_in_squad: Literal["seeking_help", "offering_help", "both"]
    matched_strength_topic: str | None
    matched_gap_topic: str | None


@dataclass
class StudySquad:
    id: str
    subject: str
    topic: str
    status: Literal["proposed", "active", "completed", "disbanded"]
    formed_by: Literal["system_match", "student_request", "mentor_assigned"]
    members: list[SquadMember] = field(default_factory=list)


@dataclass(frozen=True)
class MatchRunSummary:
    candidates_considered: int
    squads_formed: int
    avg_reciprocity_score: float
