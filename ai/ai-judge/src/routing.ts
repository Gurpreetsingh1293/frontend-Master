// Routing logic (§4.3) — decides auto_approved vs pending_review.

import type { ModuleType, ReviewFlag, ReviewStatus } from "@katalyst/shared-types";

export interface RouteReviewInput {
  moduleType: ModuleType;
  confidence: number;
  confidenceThreshold: number;
  flags: string[];
  /** true if this is a purely auto-graded online_course signal (completion + quiz, no open-ended reflection) */
  isPureAutoGraded?: boolean;
  /** training_session only: was attendance the only evidence submitted? */
  attendanceOnly?: boolean;
  /** mentoring only: action_item_completion always needs a human (mentor) confirmation */
  requiresMentorConfirmation?: boolean;
}

const BLOCKING_FLAGS: ReviewFlag[] = ["possible_plagiarism", "incomplete", "off_topic", "ai_parse_error"];

export interface RouteReviewResult {
  status: ReviewStatus;
  flags: string[];
}

export function routeReview(input: RouteReviewInput): RouteReviewResult {
  const flags = [...input.flags];
  const hasBlockingFlag = flags.some((f) => BLOCKING_FLAGS.includes(f as ReviewFlag));

  if (input.moduleType === "online_course" && input.isPureAutoGraded) {
    return { status: "auto_approved", flags };
  }

  if (input.moduleType === "mentoring" && input.requiresMentorConfirmation) {
    return { status: "pending_review", flags };
  }

  if (input.moduleType === "training_session") {
    if (input.attendanceOnly) {
      if (!flags.includes("attendance_only_no_learning_action")) {
        flags.push("attendance_only_no_learning_action");
      }
      return { status: "pending_review", flags };
    }
    return {
      status: input.confidence >= input.confidenceThreshold && !hasBlockingFlag ? "auto_approved" : "pending_review",
      flags
    };
  }

  return {
    status: input.confidence >= input.confidenceThreshold && !hasBlockingFlag ? "auto_approved" : "pending_review",
    flags
  };
}
