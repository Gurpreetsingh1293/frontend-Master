import { describe, it, expect } from "vitest";
import { routeReview } from "../src/routing.js";

describe("routeReview", () => {
  it("auto-approves online_course when purely auto-graded", () => {
    const result = routeReview({
      moduleType: "online_course",
      confidence: 0.5,
      confidenceThreshold: 0.8,
      flags: [],
      isPureAutoGraded: true
    });
    expect(result.status).toBe("auto_approved");
  });

  it("never auto-approves training_session on attendance alone (§4.3 rule)", () => {
    const result = routeReview({
      moduleType: "training_session",
      confidence: 0.99,
      confidenceThreshold: 0.8,
      flags: [],
      attendanceOnly: true
    });
    expect(result.status).toBe("pending_review");
    expect(result.flags).toContain("attendance_only_no_learning_action");
  });

  it("auto-approves training_session with other evidence and high confidence", () => {
    const result = routeReview({
      moduleType: "training_session",
      confidence: 0.9,
      confidenceThreshold: 0.8,
      flags: [],
      attendanceOnly: false
    });
    expect(result.status).toBe("auto_approved");
  });

  it("routes mentoring action_item_completion to pending_review regardless of confidence", () => {
    const result = routeReview({
      moduleType: "mentoring",
      confidence: 0.99,
      confidenceThreshold: 0.8,
      flags: [],
      requiresMentorConfirmation: true
    });
    expect(result.status).toBe("pending_review");
  });

  it("routes to pending_review when confidence is below threshold", () => {
    const result = routeReview({
      moduleType: "assignment",
      confidence: 0.6,
      confidenceThreshold: 0.8,
      flags: []
    });
    expect(result.status).toBe("pending_review");
  });

  it("routes to pending_review on a blocking flag even with high confidence", () => {
    const result = routeReview({
      moduleType: "assignment",
      confidence: 0.95,
      confidenceThreshold: 0.8,
      flags: ["possible_plagiarism"]
    });
    expect(result.status).toBe("pending_review");
  });
});
