// Deterministic XP computation (§4.2 step 4). The LLM never does this math —
// it only selects performance levels; the service layer scales XP.

import type { CriteriaLevel, PerformanceLevelKey, RubricCriterion } from "@katalyst/shared-types";
import { PERFORMANCE_LEVEL_PERCENTAGES } from "@katalyst/shared-types";

export interface ComputeXpInput {
  criteria: RubricCriterion[];
  selectedLevels: Array<{ criterion_key: string; level_key: PerformanceLevelKey; justification?: string }>;
  moduleXpWeight: number;
}

export interface ComputeXpResult {
  criteria_levels: CriteriaLevel[];
  total_earned_pct: number;
  xp_awarded: number;
}

export function computeXp(input: ComputeXpInput): ComputeXpResult {
  const { criteria, selectedLevels, moduleXpWeight } = input;

  const levelByCriterion = new Map(selectedLevels.map((l) => [l.criterion_key, l]));

  const criteria_levels: CriteriaLevel[] = criteria.map((criterion) => {
    const selected = levelByCriterion.get(criterion.key);
    if (!selected) {
      throw new Error(`Missing performance level for criterion "${criterion.key}"`);
    }
    const levelPct = PERFORMANCE_LEVEL_PERCENTAGES[selected.level_key];
    const earned_pct = (criterion.weight_pct * levelPct) / 100;
    return {
      criterion_key: criterion.key,
      level_key: selected.level_key,
      weight_pct: criterion.weight_pct,
      earned_pct,
      justification: selected.justification
    };
  });

  const total_earned_pct = criteria_levels.reduce((sum, c) => sum + c.earned_pct, 0);
  const xp_awarded = Math.round((total_earned_pct / 100) * moduleXpWeight);

  return { criteria_levels, total_earned_pct, xp_awarded };
}
