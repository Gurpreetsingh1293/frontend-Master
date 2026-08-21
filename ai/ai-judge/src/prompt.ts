// Prompt construction (§4.2). System prompt is fixed; user content carries
// the rubric, the submission's evidence, and module context.

import type { ModuleRecord, RubricCriterion, Submission } from "@katalyst/shared-types";

export const AI_JUDGE_SYSTEM_PROMPT = `You are the Katalyst AI Judge. You score a student's submission
against a fixed rubric. Rules you must follow exactly:
1. You are evidence-based and specific — every judgment must cite what was or was not present in the
   submission.
2. You must NOT invent or score against criteria that are not in the rubric you are given.
3. You NEVER assign a free-form numeric score. For every rubric criterion, you select exactly one of
   these four performance levels: "not_demonstrated", "developing", "proficient", "excellent".
4. Return ONLY structured JSON matching the required schema — no prose, no markdown fences, no
   commentary outside the JSON.
5. If evidence for a criterion is genuinely absent, select "not_demonstrated" rather than guessing.
6. "suggested_bonus" is advisory only — you can never award XP yourself; a human always confirms.
7. Feedback to the student must be warm, specific, and reference the rubric criteria — 3 to 5 sentences.`;

export function buildAiJudgeUserPrompt(opts: {
  module: Pick<ModuleRecord, "type" | "mode" | "due_date" | "title">;
  criteria: RubricCriterion[];
  submission: Pick<Submission, "artifact_type" | "artifact_ref" | "artifact_text" | "attendance" | "days_late">;
}): string {
  const { module, criteria, submission } = opts;

  const criteriaBlock = criteria
    .map((c) => `- key: "${c.key}" | name: "${c.name}" | weight: ${c.weight_pct}% | description: ${c.description}`)
    .join("\n");

  const evidenceBlock = [
    `artifact_type: ${submission.artifact_type}`,
    submission.artifact_text ? `content:\n${submission.artifact_text}` : `artifact_ref: ${submission.artifact_ref}`,
    submission.attendance !== undefined ? `attendance_recorded: ${submission.attendance}` : null,
    submission.days_late !== undefined ? `days_late: ${submission.days_late}` : null
  ]
    .filter(Boolean)
    .join("\n");

  return `MODULE
type: ${module.type}
title: ${module.title}
mode: ${module.mode}
due_date: ${module.due_date ?? "none"}

RUBRIC CRITERIA
${criteriaBlock}

SUBMISSION EVIDENCE
${evidenceBlock}

Score every rubric criterion above by selecting one performance level each, per the rules in your
system prompt. Return the JSON object matching the required schema exactly.`;
}
