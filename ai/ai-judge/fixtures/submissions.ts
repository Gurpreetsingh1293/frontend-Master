import type { Submission } from "@katalyst/shared-types";

export const assignmentSubmission: Submission = {
  id: "sub-assignment-1",
  enrollment_id: "enr-1",
  submitted_by: "user-1",
  artifact_type: "text",
  artifact_ref: "inline",
  artifact_text:
    "Implemented all three required functions, added unit tests for the edge cases, and wrote a short reflection on how the recursion approach mirrors the lecture example. Submitted one day before the deadline.",
  submitted_at: "2026-08-01T10:00:00Z",
  days_late: 0
};

export const trainingSessionAttendanceOnly: Submission = {
  id: "sub-training-1",
  enrollment_id: "enr-2",
  submitted_by: "user-2",
  artifact_type: "attendance_sync",
  artifact_ref: "konnect-sync-abc123",
  submitted_at: "2026-08-02T09:00:00Z",
  attendance: true
};
