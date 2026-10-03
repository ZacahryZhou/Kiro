import { err, ok, type Result } from "@/contracts";
import type { ChatMessage, Completion, ToolCall, ToolCallWire, ToolSpec } from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;
const MOCK_REPLY = "This is a preset reply (AI_MOCK=1). The model was not called.";

export type CompletionOptions = {
  /** Injectable for tests. */
  fetch?: typeof fetch;
  timeoutMs?: number;
};

type WireToolCall = { id?: string; function?: { name?: string; arguments?: string } };
type WireResponse = {
  choices?: { message?: { content?: string | null; tool_calls?: WireToolCall[] } }[];
};

function parseToolCall(raw: WireToolCall, index: number): ToolCall {
  const name = raw.function?.name ?? "";
  const text = raw.function?.arguments;
  const id = raw.id || `call_${index}`;
  if (text === undefined || text.trim() === "") return { id, name, args: {} };
  try {
    return { id, name, args: JSON.parse(text) as unknown };
  } catch {
    return { id, name, args: null, argsError: "The tool arguments were not valid JSON." };
  }
}

function httpErrorMessage(status: number): string {
  if (status === 401 || status === 403) {
    return "The model service rejected the credentials. Check AI_API_KEY in your local .env file.";
  }
  if (status === 429) return "The model service is rate limiting requests. Wait a minute and try again.";
  if (status >= 500) return "The model service had an error. Please try again.";
  return `The model service returned an unexpected response (HTTP ${status}).`;
}

/**
 * Calls an OpenAI-compatible chat-completions endpoint with plain fetch.
 * Never throws: failures come back as a Result error. With AI_MOCK=1 no network call is made.
 */
export async function chatCompletion(
  params: { messages: ChatMessage[]; tools?: ToolSpec[] },
  options: CompletionOptions = {},
): Promise<Result<Completion>> {
  if (process.env.AI_MOCK === "1") {
    return ok({
      content: MOCK_REPLY,
      toolCalls: [],
      message: { role: "assistant", content: MOCK_REPLY },
    });
  }

  const baseUrl = process.env.AI_BASE_URL?.trim().replace(/\/+$/, "");
  const apiKey = process.env.AI_API_KEY?.trim();
  const model = process.env.AI_MODEL?.trim();
  const missing = [
    !baseUrl && "AI_BASE_URL",
    !apiKey && "AI_API_KEY",
    !model && "AI_MODEL",
  ].filter(Boolean);
  if (missing.length > 0) {
    return err(
      "INTERNAL",
      `The AI service is not configured. Set ${missing.join(", ")} in your local .env file, or set AI_MOCK=1.`,
    );
  }

  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const body: Record<string, unknown> = {
    model,
    messages: params.messages,
    temperature: 0.2,
  };
  if (params.tools && params.tools.length > 0) {
    body.tools = params.tools.map((tool) => ({
      type: "function",
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }));
  }

  try {
    const response = await doFetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      return err("INTERNAL", httpErrorMessage(response.status), { status: response.status });
    }
    const data = (await response.json()) as WireResponse;
    const message = data.choices?.[0]?.message;
    if (!message) return err("INTERNAL", "The model service returned an empty response.");

    const toolCalls = (message.tool_calls ?? []).map(parseToolCall);
    const content = message.content ?? null;
    const wire: ToolCallWire[] = toolCalls.map((call, i) => ({
      id: call.id,
      type: "function",
      function: {
        name: call.name,
        arguments: message.tool_calls?.[i]?.function?.arguments ?? "{}",
      },
    }));
    return ok({
      content,
      toolCalls,
      message: { role: "assistant", content, ...(wire.length > 0 ? { tool_calls: wire } : {}) },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return err("INTERNAL", `The model did not respond within ${Math.round(timeoutMs / 1000)} seconds.`);
    }
    return err("INTERNAL", "Could not reach the model service. Check your network and AI_BASE_URL.");
  } finally {
    clearTimeout(timer);
  }
}
