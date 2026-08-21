// Coach turn: runs the tool-calling loop against the LLM client until it
// returns a final text reply (or hits a safety cap on iterations).

import type { ChatMessage, LlmClient } from "@katalyst/ai-client";
import { AI_COACH_SYSTEM_PROMPT } from "./systemPrompt.js";
import { COACH_TOOLS, executeTool, type ToolExecutor } from "./tools.js";

const MAX_TOOL_ITERATIONS = 5;

export interface CoachMessageInput {
  llmClient: LlmClient;
  toolExecutor: ToolExecutor;
  userId: string;
  message: string;
  history?: ChatMessage[];
}

export interface CoachMessageResult {
  reply: string;
  toolCallsMade: Array<{ name: string; args: Record<string, unknown> }>;
}

export async function coachMessage(input: CoachMessageInput): Promise<CoachMessageResult> {
  const { llmClient, toolExecutor, userId, message } = input;

  const messages: ChatMessage[] = [
    { role: "system", content: AI_COACH_SYSTEM_PROMPT },
    { role: "system", content: `The current student's user_id is "${userId}". Use it for every tool call unless the student clearly refers to someone else.` },
    ...(input.history ?? []),
    { role: "user", content: message }
  ];

  const toolCallsMade: Array<{ name: string; args: Record<string, unknown> }> = [];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const result = await llmClient.chatWithTools({ messages, tools: COACH_TOOLS });

    if (result.toolCalls.length === 0) {
      return { reply: result.text ?? "", toolCallsMade };
    }

    for (const call of result.toolCalls) {
      toolCallsMade.push(call);
      const toolResult = await executeTool(toolExecutor, call.name, call.args);
      messages.push({ role: "assistant", content: `[calling ${call.name}]` });
      messages.push({
        role: "tool",
        toolName: call.name,
        content: JSON.stringify(toolResult)
      });
    }
  }

  throw new Error("AI Coach exceeded max tool-calling iterations without a final answer");
}
