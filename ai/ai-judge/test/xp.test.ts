import { describe, it, expect } from "vitest";
import { computeXp } from "../src/xp.js";
import { getRubricCriteria, assertWeightsSumTo100 } from "../src/rubrics.js";

describe("computeXp", () => {
  it("reproduces the §11.9 worked example exactly (81.25% -> scaled XP)", () => {
    const criteria = getRubricCriteria("assignment");
    assertWeightsSumTo100(criteria);

    const result = computeXp({
      criteria,
      selectedLevels: [
        { criterion_key: "requirement_completion", level_key: "excellent" }, // 25 * 100% = 25
        { criterion_key: "quality_accuracy", level_key: "proficient" }, // 30 * 75% = 22.5
        { criterion_key: "application_of_learning", level_key: "proficient" }, // 25 * 75% = 18.75
        { criterion_key: "originality_problem_solving", level_key: "developing" }, // 10 * 50% = 5
        { criterion_key: "timeliness", level_key: "excellent" } // 10 * 100% = 10
      ],
      moduleXpWeight: 100
    });

    expect(result.total_earned_pct).toBeCloseTo(81.25, 5);
    expect(result.xp_awarded).toBe(81); // round(0.8125 * 100)
  });

  it("throws if a criterion has no selected level", () => {
    const criteria = getRubricCriteria("assignment");
    expect(() =>
      computeXp({
        criteria,
        selectedLevels: [{ criterion_key: "requirement_completion", level_key: "excellent" }],
        moduleXpWeight: 100
      })
    ).toThrow(/Missing performance level/);
  });

  it("all seed rubrics sum to 100%", () => {
    const moduleTypes = [
      "training_session",
      "online_course",
      "assignment",
      "mentoring",
      "project",
      "team_contribution",
      "certificate_course",
      "optional_activity",
      "other"
    ] as const;
    for (const type of moduleTypes) {
      expect(() => assertWeightsSumTo100(getRubricCriteria(type))).not.toThrow();
    }
  });

  it("never demonstrated on every criterion yields zero XP", () => {
    const criteria = getRubricCriteria("training_session");
    const result = computeXp({
      criteria,
      selectedLevels: criteria.map((c) => ({ criterion_key: c.key, level_key: "not_demonstrated" as const })),
      moduleXpWeight: 40
    });
    expect(result.total_earned_pct).toBe(0);
    expect(result.xp_awarded).toBe(0);
  });
});
