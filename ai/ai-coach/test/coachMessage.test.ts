import { describe, it, expect } from "vitest";
import { MockLlmClient } from "@katalyst/ai-client";
import { coachMessage } from "../src/coachMessage.js";
import { fixtureToolExecutor } from "./fixtures/toolExecutor.js";

describe("coachMessage", () => {
  it("answers a progress question by calling get_student_progress before replying", async () => {
    const llmClient = new MockLlmClient(
      [],
      [
        { text: null, toolCalls: [{ name: "get_student_progress", args: { user_id: "user-1" } }] },
        { text: "You're at 340 XP with a 3-week streak — nice work! Your Algebra assignment is due soon.", toolCalls: [] }
      ]
    );

    const result = await coachMessage({
      llmClient,
      toolExecutor: fixtureToolExecutor,
      userId: "user-1",
      message: "How am I doing?"
    });

    expect(result.toolCallsMade).toHaveLength(1);
    expect(result.toolCallsMade[0].name).toBe("get_student_progress");
    expect(result.reply).toContain("340 XP");
  });

  it("answers a content question by calling search_knowledge_base and grounds the reply", async () => {
    const llmClient = new MockLlmClient(
      [],
      [
        {
          text: null,
          toolCalls: [
            { name: "get_topic_performance", args: { user_id: "user-1", subject: "Algebra" } },
            { name: "search_knowledge_base", args: { query: "quadratic equations", subject: "Algebra" } }
          ]
        },
        {
          text: "From your Grade 10 Algebra notes: a quadratic equation has the form ax^2 + bx + c = 0. Since quadratic equations have been trending down for you, let's practice a few together.",
          toolCalls: []
        }
      ]
    );

    const result = await coachMessage({
      llmClient,
      toolExecutor: fixtureToolExecutor,
      userId: "user-1",
      message: "I don't understand quadratic equations"
    });

    const toolNames = result.toolCallsMade.map((c) => c.name);
    expect(toolNames).toContain("search_knowledge_base");
    expect(toolNames).toContain("get_topic_performance");
    expect(result.reply).toContain("Grade 10 Algebra notes");
  });

  it("calls accept_mission only when invoked explicitly by the flow", async () => {
    const llmClient = new MockLlmClient(
      [],
      [
        { text: null, toolCalls: [{ name: "accept_mission", args: { user_id: "user-1", mission_id: "mission-1" } }] },
        { text: "You're in! Mission accepted — go earn that 25 XP.", toolCalls: [] }
      ]
    );

    const result = await coachMessage({
      llmClient,
      toolExecutor: fixtureToolExecutor,
      userId: "user-1",
      message: "Yes, sign me up for that mission"
    });

    expect(result.toolCallsMade[0].name).toBe("accept_mission");
    expect(result.reply).toContain("accepted");
  });

  it("throws if the model never stops calling tools (safety cap)", async () => {
    const infiniteToolCalls = Array.from({ length: 6 }, () => ({
      text: null,
      toolCalls: [{ name: "get_student_progress", args: { user_id: "user-1" } }]
    }));
    const llmClient = new MockLlmClient([], infiniteToolCalls);

    await expect(
      coachMessage({ llmClient, toolExecutor: fixtureToolExecutor, userId: "user-1", message: "hi" })
    ).rejects.toThrow(/max tool-calling iterations/);
  });
});
