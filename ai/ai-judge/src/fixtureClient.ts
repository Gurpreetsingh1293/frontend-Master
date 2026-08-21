// Deterministic fixture LLM client (§16 Phase 3 / §14) — lets the API route
// (and local dev) exercise the full scoring pipeline with zero API key.
// Every criterion defaults to "proficient" so the routing/XP math is visibly
// exercised without pretending to be a real judgment.

import { StaticLlmClient, type LlmClient } from "@katalyst/ai-client";
import type { RubricCriterion } from "@katalyst/shared-types";

export function createFixtureJudgeClient(criteria: RubricCriterion[]): LlmClient {
  return new StaticLlmClient(() => ({
    criteria_levels: criteria.map((c) => ({
      criterion_key: c.key,
      level_key: "proficient",
      justification: `Fixture mode: defaulted to "proficient" for "${c.name}" — set GEMINI_API_KEY for a real AI Judge score.`
    })),
    confidence: 0.75,
    flags: [],
    suggested_bonus: "none",
    student_feedback:
      "This is a fixture review (no live LLM key configured) — every criterion defaulted to 'proficient' so you can see the full scoring pipeline end to end."
  }));
}
