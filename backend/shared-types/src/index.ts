// Shared domain types — mirrors §2 (schema) and §11 (XP weighting model) of
// Katalyst_Build_Spec_for_Claude_Code.md. Kept dependency-free so both
// ai-judge and ai-coach (and eventually the web apps) can import it directly.

export type ModuleType =
  | "training_session"
  | "online_course"
  | "mentoring"
  | "project"
  | "assignment"
  | "certificate_course"
  | "optional_activity"
  | "team_contribution"
  | "other";

export type ModuleMode = "mandatory" | "optional" | "certificate";

export interface RubricCriterion {
  key: string;
  name: string;
  weight_pct: number;
  description: string;
}

export interface Rubric {
  id: string;
  version: number;
  module_type: ModuleType;
  criteria: RubricCriterion[]; // weight_pct must sum to 100
  ai_judge_prompt_template: string;
  confidence_threshold: number;
  xp_cap_period?: "monthly" | null;
  xp_cap_amount?: number | null;
}

export const PERFORMANCE_LEVELS = [
  "not_demonstrated",
  "developing",
  "proficient",
  "excellent"
] as const;

export type PerformanceLevelKey = (typeof PERFORMANCE_LEVELS)[number];

// §11.9 — fixed, system-wide. Never per-rubric.
export const PERFORMANCE_LEVEL_PERCENTAGES: Record<PerformanceLevelKey, number> = {
  not_demonstrated: 0,
  developing: 50,
  proficient: 75,
  excellent: 100
};

export interface ModuleRecord {
  id: string;
  type: ModuleType;
  title: string;
  description: string;
  mode: ModuleMode;
  due_date: string | null;
  xp_weight: number;
  is_team_based: boolean;
  rubric_id: string;
}

export type ArtifactType = "file" | "link" | "text" | "attendance_sync" | "certificate";

export interface Submission {
  id: string;
  enrollment_id: string;
  submitted_by: string;
  team_role?: string | null;
  artifact_type: ArtifactType;
  artifact_ref: string; // S3 key / URL / inline text
  artifact_text?: string; // extracted text content, if applicable
  submitted_at: string;
  attendance?: boolean; // for training_session/attendance_sync
  days_late?: number;
}

export type ReviewFlag =
  | "possible_plagiarism"
  | "incomplete"
  | "off_topic"
  | "late_submission"
  | "attendance_only_no_learning_action"
  | "ai_parse_error"
  | "none";

export type BonusType =
  | "meaningful_revision"
  | "team_mission_help"
  | "weekly_consistency"
  | "exceptional_improvement"
  | "early_completion_quality"
  | "none";

export type ReviewStatus =
  | "ai_draft"
  | "auto_approved"
  | "pending_review"
  | "approved"
  | "overridden"
  | "rejected";

export interface CriteriaLevel {
  criterion_key: string;
  level_key: PerformanceLevelKey;
  weight_pct: number;
  earned_pct: number;
  justification?: string;
}

export interface Review {
  id: string;
  submission_id: string;
  reviewer_type: "ai_judge" | "management";
  reviewer_user_id?: string | null;
  criteria_levels: CriteriaLevel[];
  total_earned_pct: number;
  xp_awarded: number;
  feedback_text: string;
  confidence?: number;
  flags: ReviewFlag[];
  suggested_bonus?: BonusType;
  rubric_id: string;
  status: ReviewStatus;
}

// Raw structured output the LLM must produce (§4.2) — pre-validation, pre-XP-computation.
export interface AiJudgeRawOutput {
  criteria_levels: Array<{
    criterion_key: string;
    level_key: string;
    justification: string;
  }>;
  confidence: number;
  flags: string[];
  suggested_bonus: string;
  student_feedback: string;
}

export interface StudentTopicPerformance {
  user_id: string;
  subject: string;
  topic: string;
  accuracy_pct: number;
  attempts: number;
  last_attempt_at: string;
  trend: "improving" | "stable" | "declining";
}

export interface StudentProgress {
  user_id: string;
  xp_total: number;
  level: string;
  current_week_streak: number;
  longest_week_streak: number;
  active_enrollments: Array<{ module_id: string; title: string; due_date: string | null; status: string }>;
}
