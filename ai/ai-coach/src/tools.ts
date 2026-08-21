// Tool definitions (§5.1) — JSON Schema for Gemini function-calling, plus
// the executor interface. Real deployments implement ToolExecutor against
// Postgres/Redis; tests and fixture-driven dev use FixtureToolExecutor
// (see fixtures/toolExecutor.ts).

import type { ToolDefinition } from "@katalyst/ai-client";
import type { StudentProgress, StudentTopicPerformance } from "@katalyst/shared-types";

export const COACH_TOOLS: ToolDefinition[] = [
  {
    name: "get_student_progress",
    description: "Get the student's XP total, level, streaks, and active enrollments. Call before any status claim.",
    parameters: {
      type: "object",
      properties: { user_id: { type: "string" } },
      required: ["user_id"]
    }
  },
  {
    name: "get_leaderboard",
    description: "Get the student's rank and neighbors on a leaderboard.",
    parameters: {
      type: "object",
      properties: {
        user_id: { type: "string" },
        scope: { type: "string", enum: ["individual", "team"] },
        window: { type: "string", enum: ["week", "month", "year"] }
      },
      required: ["user_id", "scope", "window"]
    }
  },
  {
    name: "get_recent_reviews",
    description: "Get recently approved reviews/feedback not yet delivered to the student.",
    parameters: {
      type: "object",
      properties: { user_id: { type: "string" }, limit: { type: "number" } },
      required: ["user_id"]
    }
  },
  {
    name: "get_available_missions",
    description: "Get open missions that match the student's current gaps.",
    parameters: {
      type: "object",
      properties: { user_id: { type: "string" } },
      required: ["user_id"]
    }
  },
  {
    name: "accept_mission",
    description: "Enroll the student in a mission. Only call after explicit confirmation from the student.",
    parameters: {
      type: "object",
      properties: { user_id: { type: "string" }, mission_id: { type: "string" } },
      required: ["user_id", "mission_id"]
    }
  },
  {
    name: "get_module_catalog",
    description: "Look up published modules, e.g. to answer 'what's due' or 'what's this worth'.",
    parameters: {
      type: "object",
      properties: { filter: { type: "string" } }
    }
  },
  {
    name: "search_knowledge_base",
    description:
      "RAG lookup against mentor-ingested curriculum/notes/FAQ material, filtered by grade/subject/chapter/topic. Use for content questions, never progress questions.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        grade: { type: "string" },
        subject: { type: "string" }
      },
      required: ["query"]
    }
  },
  {
    name: "get_topic_performance",
    description: "Get the student's per-topic accuracy/trend to ground a personalized explanation.",
    parameters: {
      type: "object",
      properties: { user_id: { type: "string" }, subject: { type: "string" } },
      required: ["user_id"]
    }
  }
];

export interface LeaderboardResult {
  rank: number;
  window: string;
  scope: string;
  neighbors: Array<{ user_id: string; name: string; xp: number }>;
}

export interface RecentReview {
  review_id: string;
  module_title: string;
  xp_awarded: number;
  feedback_text: string;
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  reward_xp: number;
}

export interface KnowledgeSearchResult {
  document_title: string;
  document_type: string;
  excerpt: string;
}

export interface ToolExecutor {
  get_student_progress(args: { user_id: string }): Promise<StudentProgress>;
  get_leaderboard(args: { user_id: string; scope: string; window: string }): Promise<LeaderboardResult>;
  get_recent_reviews(args: { user_id: string; limit?: number }): Promise<RecentReview[]>;
  get_available_missions(args: { user_id: string }): Promise<Mission[]>;
  accept_mission(args: { user_id: string; mission_id: string }): Promise<{ accepted: boolean }>;
  get_module_catalog(args: { filter?: string }): Promise<Array<{ id: string; title: string; xp_weight: number; due_date: string | null }>>;
  search_knowledge_base(args: { query: string; grade?: string; subject?: string }): Promise<KnowledgeSearchResult[]>;
  get_topic_performance(args: { user_id: string; subject?: string }): Promise<StudentTopicPerformance[]>;
}

export async function executeTool(
  executor: ToolExecutor,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "get_student_progress":
      return executor.get_student_progress(args as { user_id: string });
    case "get_leaderboard":
      return executor.get_leaderboard(args as { user_id: string; scope: string; window: string });
    case "get_recent_reviews":
      return executor.get_recent_reviews(args as { user_id: string; limit?: number });
    case "get_available_missions":
      return executor.get_available_missions(args as { user_id: string });
    case "accept_mission":
      return executor.accept_mission(args as { user_id: string; mission_id: string });
    case "get_module_catalog":
      return executor.get_module_catalog(args as { filter?: string });
    case "search_knowledge_base":
      return executor.search_knowledge_base(args as { query: string; grade?: string; subject?: string });
    case "get_topic_performance":
      return executor.get_topic_performance(args as { user_id: string; subject?: string });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
