import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, buildUserMessage } from "./prompt";
import { loadTarget, renderTarget } from "./target";
import { loadSnapshots, renderSnapshots } from "./inspect";
import type { GeneratedTest, Generator, TestRequest } from "./types";

const MODEL = "claude-opus-5";

// Claude Opus 5 list price, USD per million tokens. Used only to print what a
// generation cost — the market analysis in docs/ argues on cost per test.
const PRICE_INPUT_PER_MTOK = 5.0;
const PRICE_OUTPUT_PER_MTOK = 25.0;

export class ClaudeGenerator implements Generator {
  private client: Anthropic;

  constructor() {
    // Resolves ANTHROPIC_API_KEY (or an `ant auth login` profile) from the
    // environment. Never hard-code a key.
    this.client = new Anthropic();
  }

  async generate(request: TestRequest): Promise<GeneratedTest> {
    const targetContext = renderTarget(await loadTarget());
    const pageStructure = renderSnapshots(await loadSnapshots(request.baseURL));

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 8000,
        // The system prompt is stable across every request, so cache it.
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [
          { role: "user", content: buildUserMessage(request.description, request.baseURL, targetContext, pageStructure) },
        ],
      });
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        throw new Error("ANTHROPIC_API_KEY is set but was rejected. Check the key, or unset it to run in cache-only mode.");
      }
      if (error instanceof Anthropic.RateLimitError) {
        throw new Error("Rate limited by the API. Wait and retry, or run in cache-only mode.");
      }
      if (error instanceof Anthropic.APIError) {
        throw new Error(`Claude API error ${error.status}: ${error.message}`);
      }
      throw error;
    }

    if (response.stop_reason === "refusal") {
      throw new Error("The model declined this request. Rephrase the test description.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error("Output hit max_tokens and the file is truncated. Split the request into smaller tests.");
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const { filename, code } = parseResponse(text);

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    return {
      filename,
      code,
      source: "claude",
      usage: {
        inputTokens,
        outputTokens,
        estimatedCostUsd:
          (inputTokens / 1_000_000) * PRICE_INPUT_PER_MTOK +
          (outputTokens / 1_000_000) * PRICE_OUTPUT_PER_MTOK,
      },
    };
  }
}

/**
 * The prompt pins the output format, but a model is not a parser — so this
 * validates rather than trusts, and fails loudly instead of writing a broken file.
 */
export function parseResponse(text: string): { filename: string; code: string } {
  const nameMatch = text.match(/FILENAME:\s*([\w.-]+\.spec\.ts)/);
  const codeMatch = text.match(/```(?:typescript|ts)\n([\s\S]*?)```/);

  if (!codeMatch?.[1]) {
    throw new Error(`No TypeScript code block in the response. Got:\n${text.slice(0, 400)}`);
  }
  const code = codeMatch[1].trim() + "\n";
  if (!code.includes("@playwright/test")) {
    throw new Error("Generated file does not import @playwright/test — refusing to write it.");
  }

  return { filename: nameMatch?.[1] ?? "generated.spec.ts", code };
}
