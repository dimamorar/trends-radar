/**
 * AI Agent
 *
 * Multi-step AI agent for news analysis using Vercel AI SDK v6
 * Supports tool calling and iterative refinement
 */

import {
  generateText,
  stepCountIs,
  type LanguageModel,
  type ModelMessage,
  type SystemModelMessage,
  type UserModelMessage,
  type Tool,
  type StepResult,
  type ToolSet,
} from "ai";
import { logger } from "../utils/logger";
import { newsAnalysisTools, type NewsAnalysisTools } from "./tools";

/**
 * Agent configuration
 */
export interface AgentConfig {
  model: LanguageModel;
  maxSteps?: number;
  tools?: Partial<NewsAnalysisTools>;
  systemPrompt?: string;
}

/**
 * Agent execution result
 */
export interface AgentResult {
  response: string;
  toolCalls: ToolCallRecord[];
  steps: number;
  success: boolean;
  error?: string;
}

/**
 * Record of a tool call
 */
export interface ToolCallRecord {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  timestamp: Date;
}

/**
 * News Analysis Agent
 *
 * An AI agent that can use tools to analyze news data
 */
export class NewsAnalysisAgent {
  private model: LanguageModel;
  private maxSteps: number;
  private tools: Record<string, Tool>;
  private systemPrompt: string;

  constructor(config: AgentConfig) {
    this.model = config.model;
    this.maxSteps = config.maxSteps ?? 5;
    this.tools = (config.tools ?? newsAnalysisTools) as Record<string, Tool>;
    this.systemPrompt =
      config.systemPrompt ??
      `You are an intelligent news analysis agent. You have access to tools that help you:
- Categorize news items
- Analyze sentiment
- Search for related news
- Detect trends
- Summarize content
- Extract entities
- Compare sources

Use these tools when they would help provide better analysis. Be thorough but efficient.
Always explain your reasoning and findings clearly.`;
  }

  /**
   * Run the agent with a task
   */
  async run(task: string, context?: string): Promise<AgentResult> {
    const toolCalls: ToolCallRecord[] = [];
    let steps = 0;

    try {
      const messages: ModelMessage[] = [
        { role: "system", content: this.systemPrompt } as SystemModelMessage,
        {
          role: "user",
          content: context ? `${task}\n\nContext:\n${context}` : task,
        } as UserModelMessage,
      ];

      logger.info(`[Agent] Starting task: ${task.substring(0, 100)}...`);

      // Use generateText with tools - v6 uses stopWhen instead of maxSteps
      const result = await generateText({
        model: this.model,
        messages,
        tools: this.tools,
        stopWhen: stepCountIs(this.maxSteps),
        onStepFinish: (stepResult: StepResult<ToolSet>) => {
          steps++;
          const stepCalls = stepResult.toolCalls;
          if (stepCalls && stepCalls.length > 0) {
            for (const call of stepCalls) {
              toolCalls.push({
                toolName: call.toolName,
                args:
                  "args" in call ? (call.args as Record<string, unknown>) : {},
                result: null,
                timestamp: new Date(),
              });
              logger.info(`[Agent] Tool call: ${call.toolName}`);
            }
          }
        },
      });

      logger.info(
        `[Agent] Completed in ${steps} steps with ${toolCalls.length} tool calls`,
      );

      return {
        response: result.text,
        toolCalls,
        steps,
        success: true,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ error }, "[Agent] Execution failed");

      return {
        response: "",
        toolCalls,
        steps,
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Analyze news with the agent
   */
  async analyzeNews(
    newsItems: Array<{ title: string; source?: string; content?: string }>,
  ): Promise<AgentResult> {
    const newsContext = newsItems
      .map((item, i) => `${i + 1}. [${item.source || "Unknown"}] ${item.title}`)
      .join("\n");

    const task = `Analyze the following ${newsItems.length} news items.
Use the available tools to:
1. Detect any emerging trends
2. Analyze overall sentiment
3. Identify key topics and their relationships
4. Highlight any anomalies or weak signals

Provide a comprehensive analysis with your findings.`;

    return this.run(task, newsContext);
  }

  /**
   * Deep dive into a specific topic
   */
  async deepDive(
    topic: string,
    newsItems: Array<{ title: string; source?: string }>,
  ): Promise<AgentResult> {
    const newsContext = newsItems
      .map((item, i) => `${i + 1}. [${item.source || "Unknown"}] ${item.title}`)
      .join("\n");

    const task = `Perform a deep dive analysis on the topic: "${topic}"

Using the news items provided and the available tools:
1. Search for related news
2. Compare how different sources cover this topic
3. Extract key entities involved
4. Analyze the sentiment around this topic
5. Identify any trends related to this topic

Provide detailed insights and recommendations.`;

    return this.run(task, newsContext);
  }
}

/**
 * Create a news analysis agent
 */
export function createNewsAgent(
  model: LanguageModel,
  options?: {
    maxSteps?: number;
    customTools?: Partial<NewsAnalysisTools>;
  },
): NewsAnalysisAgent {
  return new NewsAnalysisAgent({
    model,
    maxSteps: options?.maxSteps,
    tools: options?.customTools,
  });
}

/**
 * Simple one-shot tool call helper
 * Useful for quick tool invocations without the full agent loop
 */
export async function callTool<T extends keyof NewsAnalysisTools>(
  model: LanguageModel,
  toolName: T,
  prompt: string,
): Promise<{
  response: string;
  toolResult: unknown | null;
}> {
  const tool = newsAnalysisTools[toolName];

  try {
    const result = await generateText({
      model,
      prompt,
      tools: { [toolName]: tool },
      stopWhen: stepCountIs(2), // Allow one tool call and response
    });

    const toolResult = result.toolCalls?.[0] ?? null;

    return {
      response: result.text,
      toolResult,
    };
  } catch (error) {
    logger.error({ error }, `[callTool] Failed to call ${String(toolName)}`);
    throw error;
  }
}

export default NewsAnalysisAgent;
