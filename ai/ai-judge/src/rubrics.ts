// Seed rubric criteria — verbatim from §11.1–§11.8 of the build spec.
// These are fixtures/defaults; real deployments store rubric rows in
// Postgres (`rubrics` table, §2), but the weight tables themselves are
// authoritative here so both the seed migration and the AI Judge agree.

import type { ModuleType, RubricCriterion } from "@katalyst/shared-types";

export const RUBRIC_CRITERIA: Record<ModuleType, RubricCriterion[]> = {
  training_session: [
    { key: "attendance", name: "Attendance", weight_pct: 40, description: "Physical/virtual presence for the session." },
    { key: "participation", name: "Participation", weight_pct: 25, description: "Active engagement during the session." },
    { key: "quiz_activity", name: "Quiz / Activity", weight_pct: 25, description: "Performance on in-session quiz or activity." },
    { key: "reflection_feedback", name: "Reflection / Feedback", weight_pct: 10, description: "Post-session reflection or feedback submitted." }
  ],
  online_course: [
    { key: "course_completion", name: "Course Completion", weight_pct: 35, description: "Modules/units completed." },
    { key: "assessment_score", name: "Assessment Score", weight_pct: 30, description: "Score on embedded assessments/quizzes." },
    { key: "certificate_evidence", name: "Certificate Evidence", weight_pct: 15, description: "Proof of completion certificate." },
    { key: "learning_reflection", name: "Learning Reflection", weight_pct: 10, description: "Reflection on what was learned." },
    { key: "timeliness", name: "Timeliness", weight_pct: 10, description: "Completed by the due date." }
  ],
  assignment: [
    { key: "requirement_completion", name: "Requirement Completion", weight_pct: 25, description: "All stated requirements addressed." },
    { key: "quality_accuracy", name: "Quality / Accuracy", weight_pct: 30, description: "Correctness and quality of the work." },
    { key: "application_of_learning", name: "Application of Learning", weight_pct: 25, description: "Demonstrated application of taught concepts." },
    { key: "originality_problem_solving", name: "Originality / Problem Solving", weight_pct: 10, description: "Original thinking or problem-solving approach." },
    { key: "timeliness", name: "Timeliness", weight_pct: 10, description: "Submitted by the due date." }
  ],
  mentoring: [
    { key: "session_attendance", name: "Session Attendance", weight_pct: 20, description: "Attended the mentoring session." },
    { key: "preparation", name: "Preparation", weight_pct: 15, description: "Came prepared with questions/updates." },
    { key: "participation", name: "Participation", weight_pct: 20, description: "Active engagement during the session." },
    { key: "action_item_completion", name: "Action Item Completion", weight_pct: 30, description: "Completed previously agreed action items — mentor-confirmed only, see §11.4." },
    { key: "reflection_progress_update", name: "Reflection / Progress Update", weight_pct: 15, description: "Reflected on progress since last session." }
  ],
  project: [
    { key: "problem_understanding", name: "Problem Understanding", weight_pct: 15, description: "Grasp of the problem being solved." },
    { key: "quality_of_solution", name: "Quality of Solution", weight_pct: 25, description: "Technical/creative quality of the solution." },
    { key: "practical_implementation", name: "Practical Implementation", weight_pct: 20, description: "Working, usable implementation." },
    { key: "documentation_presentation", name: "Documentation / Presentation", weight_pct: 10, description: "Clarity of documentation/presentation." },
    { key: "milestone_completion", name: "Milestone Completion", weight_pct: 15, description: "Milestones met on schedule." },
    { key: "collaboration", name: "Collaboration / Individual Initiative", weight_pct: 15, description: "Team collaboration (team projects) or individual initiative (solo projects)." }
  ],
  team_contribution: [
    { key: "assigned_responsibility_completed", name: "Assigned Responsibility Completed", weight_pct: 35, description: "The member's assigned scope was completed." },
    { key: "quality_of_contribution", name: "Quality of Contribution", weight_pct: 25, description: "Quality of what the member delivered." },
    { key: "collaboration_communication", name: "Collaboration & Communication", weight_pct: 20, description: "How well the member worked with the team." },
    { key: "timeliness", name: "Timeliness", weight_pct: 10, description: "Delivered on schedule." },
    { key: "peer_mentor_acknowledgment", name: "Peer / Mentor Acknowledgment", weight_pct: 10, description: "Acknowledged positively by peers/mentor." }
  ],
  certificate_course: [
    { key: "valid_certificate", name: "Valid Certificate", weight_pct: 30, description: "A valid, verifiable certificate was provided." },
    { key: "course_completion", name: "Course Completion", weight_pct: 20, description: "Course content completed." },
    { key: "assessment_score", name: "Assessment Score", weight_pct: 25, description: "Score on course assessments." },
    { key: "relevance_to_pathway", name: "Relevance to Pathway", weight_pct: 10, description: "Relevance of the course to the student's learning pathway." },
    { key: "reflection_application", name: "Reflection / Application", weight_pct: 15, description: "Reflection on how the learning will be applied." }
  ],
  optional_activity: [
    { key: "verified_completion", name: "Verified Completion", weight_pct: 30, description: "Completion of the activity is verifiable." },
    { key: "relevance", name: "Relevance", weight_pct: 20, description: "Relevance to the student's learning goals." },
    { key: "quality", name: "Quality", weight_pct: 20, description: "Quality of the work/output." },
    { key: "application", name: "Application", weight_pct: 20, description: "Application of concepts learned." },
    { key: "reflection", name: "Reflection", weight_pct: 10, description: "Reflection on the activity." }
  ],
  other: [
    { key: "completion", name: "Completion", weight_pct: 60, description: "The activity was completed as described." },
    { key: "quality", name: "Quality", weight_pct: 40, description: "Quality of the completed work." }
  ]
};

export function getRubricCriteria(moduleType: ModuleType): RubricCriterion[] {
  const criteria = RUBRIC_CRITERIA[moduleType];
  if (!criteria) throw new Error(`No seed rubric criteria for module type "${moduleType}"`);
  return criteria;
}

export function assertWeightsSumTo100(criteria: RubricCriterion[]): void {
  const total = criteria.reduce((sum, c) => sum + c.weight_pct, 0);
  if (Math.abs(total - 100) > 0.01) {
    throw new Error(`Rubric criteria weights must sum to 100, got ${total}`);
  }
}
