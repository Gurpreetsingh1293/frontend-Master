// Zod schema for the AI Judge's structured output (§4.2). The LLM must
// select one of the four fixed performance levels per criterion — never a
// free numeric score.

import { z } from "zod";
import { PERFORMANCE_LEVELS } from "@katalyst/shared-types";

export const AiJudgeOutputSchema = z.object({
  criteria_levels: z
    .array(
      z.object({
        criterion_key: z.string().min(1),
        level_key: z.enum(PERFORMANCE_LEVELS),
        justification: z.string().min(1)
      })
    )
    .min(1),
  confidence: z.number().min(0).max(1),
  flags: z.array(z.string()).default([]),
  suggested_bonus: z.string().default("none"),
  student_feedback: z.string().min(1)
});

export type AiJudgeOutput = z.infer<typeof AiJudgeOutputSchema>;
