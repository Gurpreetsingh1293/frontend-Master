import { describe, it, expect } from "vitest";
import { MockLlmClient } from "@katalyst/ai-client";
import { scoreSubmission } from "../src/scoreSubmission.js";
import { getRubricCriteria } from "../src/rubrics.js";
import { assignmentSubmission, trainingSessionAttendanceOnly } from "../fixtures/submissions.js";

describe("scoreSubmission", () => {
  it("scores a well-formed submission end to end and auto-approves it", async () => {
    const criteria = getRubricCriteria("assignment");
    const llmClient = new MockLlmClient([
      {
        criteria_levels: criteria.map((c) => ({
          criterion_key: c.key,
          level_key: "excellent",
          justification: "Fully demonstrated in the submission."
        })),
        confidence: 0.92,
        flags: [],
        suggested_bonus: "none",
        student_feedback: "Great work — every requirement was met with high quality and on time."
      }
    ]);

    const review = await scoreSubmission({
      llmClient,
      module: { type: "assignment", mode: "mandatory", due_date: null, title: "Recursion Assignment", xp_weight: 100 },
      criteria,
      rubricId: "rubric-assignment-v1",
      confidenceThreshold: 0.8,
      submission: assignmentSubmission
    });

    expect(review.status).toBe("auto_approved");
    expect(review.xp_awarded).toBe(100);
    expect(review.total_earned_pct).toBe(100);
    expect(review.criteria_levels).toHaveLength(criteria.length);
  });

  it("routes an attendance-only training session to pending_review with the correct flag", async () => {
    const criteria = getRubricCriteria("training_session");
    const llmClient = new MockLlmClient([
      {
        criteria_levels: criteria.map((c) => ({
          criterion_key: c.key,
          level_key: c.key === "attendance" ? "excellent" : "not_demonstrated",
          justification: "Only attendance evidence present."
        })),
        confidence: 0.95,
        flags: [],
        suggested_bonus: "none",
        student_feedback: "You attended, but no other learning-action evidence was submitted this time."
      }
    ]);

    const review = await scoreSubmission({
      llmClient,
      module: { type: "training_session", mode: "mandatory", due_date: null, title: "Intro to Algebra", xp_weight: 40 },
      criteria,
      rubricId: "rubric-training-v1",
      confidenceThreshold: 0.8,
      submission: trainingSessionAttendanceOnly,
      routingHints: { attendanceOnly: true }
    });

    expect(review.status).toBe("pending_review");
    expect(review.flags).toContain("attendance_only_no_learning_action");
    expect(review.xp_awarded).toBe(16); // only 40% weight (attendance) at 100% -> 40*100/100=40 -> 0.40*40xp = 16
  });

  it("routes to pending_review with ai_parse_error when the model returns an unknown criterion_key", async () => {
    const criteria = getRubricCriteria("assignment");
    const llmClient = new MockLlmClient([
      {
        criteria_levels: [
          { criterion_key: "not_a_real_criterion", level_key: "excellent", justification: "n/a" }
        ],
        confidence: 0.9,
        flags: [],
        suggested_bonus: "none",
        student_feedback: "n/a"
      }
    ]);

    const review = await scoreSubmission({
      llmClient,
      module: { type: "assignment", mode: "mandatory", due_date: null, title: "Recursion Assignment", xp_weight: 100 },
      criteria,
      rubricId: "rubric-assignment-v1",
      confidenceThreshold: 0.8,
      submission: assignmentSubmission
    });

    expect(review.status).toBe("pending_review");
    expect(review.flags).toContain("ai_parse_error");
    expect(review.xp_awarded).toBe(0);
  });

  it("routes to pending_review with ai_parse_error when the LLM output fails schema validation", async () => {
    const criteria = getRubricCriteria("assignment");
    const llmClient = new MockLlmClient([{ garbage: true }]);

    const review = await scoreSubmission({
      llmClient,
      module: { type: "assignment", mode: "mandatory", due_date: null, title: "Recursion Assignment", xp_weight: 100 },
      criteria,
      rubricId: "rubric-assignment-v1",
      confidenceThreshold: 0.8,
      submission: assignmentSubmission
    });

    expect(review.status).toBe("pending_review");
    expect(review.flags).toContain("ai_parse_error");
  });
});
