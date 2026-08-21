import type { ToolExecutor } from "../../src/tools.js";

export const fixtureToolExecutor: ToolExecutor = {
  async get_student_progress({ user_id }) {
    return {
      user_id,
      xp_total: 340,
      level: "Rising Star",
      current_week_streak: 3,
      longest_week_streak: 5,
      active_enrollments: [
        { module_id: "mod-1", title: "Grade 10 Algebra Assignment", due_date: "2026-08-25T00:00:00Z", status: "in_progress" }
      ]
    };
  },
  async get_leaderboard({ user_id, scope, window }) {
    return {
      rank: 12,
      window,
      scope,
      neighbors: [
        { user_id: "user-a", name: "Asha", xp: 360 },
        { user_id, name: "You", xp: 340 },
        { user_id: "user-b", name: "Ben", xp: 320 }
      ]
    };
  },
  async get_recent_reviews({ user_id }) {
    return [
      { review_id: "rev-1", module_title: "Intro to Algebra", xp_awarded: 32, feedback_text: "Good reflection, keep it up!" }
    ];
  },
  async get_available_missions() {
    return [{ id: "mission-1", title: "Complete 2 optional courses this week", description: "...", reward_xp: 25 }];
  },
  async accept_mission({ mission_id }) {
    return { accepted: true };
  },
  async get_module_catalog() {
    return [{ id: "mod-1", title: "Grade 10 Algebra Assignment", xp_weight: 100, due_date: "2026-08-25T00:00:00Z" }];
  },
  async search_knowledge_base({ query }) {
    return [
      {
        document_title: "Grade 10 Algebra Notes",
        document_type: "notes",
        excerpt: `A quadratic equation is any equation of the form ax^2 + bx + c = 0. Relevant to: "${query}".`
      }
    ];
  },
  async get_topic_performance({ user_id, subject }) {
    return [
      {
        user_id,
        subject: subject ?? "Algebra",
        topic: "quadratic_equations",
        accuracy_pct: 42,
        attempts: 6,
        last_attempt_at: "2026-08-15T00:00:00Z",
        trend: "declining"
      }
    ];
  }
};
