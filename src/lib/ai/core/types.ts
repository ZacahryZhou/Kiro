// Types shared by the model provider and the agent loop (OpenAI-compatible message format).

export type ToolCallWire = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCallWire[] }
  | { role: "tool"; tool_call_id: string; content: string };

/** What the provider needs to describe a tool to the model. */
export type ToolSpec = {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments. */
  parameters: Record<string, unknown>;
};

export type ToolCall = {
  id: string;
  name: string;
  /** Parsed arguments, or null when the model sent invalid JSON (see argsError). */
  args: unknown;
  argsError?: string;
};

export type Completion = {
  content: string | null;
  toolCalls: ToolCall[];
  /** The assistant message to append to the conversation before sending tool results back. */
  message: Extract<ChatMessage, { role: "assistant" }>;
};
