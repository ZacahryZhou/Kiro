// Assertion script for the model provider (no network, no real key).
// Run: npx tsx src/lib/ai/dev/provider-check.ts
import { chatCompletion } from "../core/provider";
import type { ToolSpec } from "../core/types";

let failures = 0;
function check(name: string, condition: boolean, extra?: unknown) {
  if (!condition) failures += 1;
  const detail = condition || extra === undefined ? "" : ` -> ${JSON.stringify(extra)}`;
  console.info(`${condition ? "PASS" : "FAIL"}  ${name}${detail}`);
}

const messages = [{ role: "user" as const, content: "hello" }];
const tool: ToolSpec = {
  name: "listMyCourses",
  description: "List the signed-in user's courses.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
};
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function setEnv(env: Record<string, string | undefined>) {
  for (const key of ["AI_MOCK", "AI_BASE_URL", "AI_API_KEY", "AI_MODEL"]) delete process.env[key];
  for (const [key, value] of Object.entries(env)) if (value !== undefined) process.env[key] = value;
}
const configured = { AI_BASE_URL: "https://api.example.test/v1/", AI_API_KEY: "test-key-not-real", AI_MODEL: "test-model" };

async function main() {
  // Mock mode: no network call at all.
  setEnv({ AI_MOCK: "1" });
  let called = false;
  const mock = await chatCompletion({ messages }, { fetch: (async () => { called = true; return jsonResponse({}); }) as typeof fetch });
  check("AI_MOCK=1 returns a preset reply without calling fetch", mock.ok && !!mock.data.content && !called);

  // Missing configuration.
  setEnv({});
  const unconfigured = await chatCompletion({ messages });
  check("Missing env -> clear error naming the variables", !unconfigured.ok && unconfigured.error.message.includes("AI_BASE_URL") && unconfigured.error.message.includes("AI_API_KEY") && unconfigured.error.message.includes("AI_MODEL"));
  setEnv({ AI_BASE_URL: "https://api.example.test" });
  const partial = await chatCompletion({ messages });
  check("Only the missing variables are listed", !partial.ok && !partial.error.message.includes("AI_BASE_URL") && partial.error.message.includes("AI_API_KEY"));

  // Request shape.
  setEnv(configured);
  let captured: { url: string; init: RequestInit } | undefined;
  const text = await chatCompletion({ messages, tools: [tool] }, {
    fetch: (async (url: string, init: RequestInit) => {
      captured = { url, init };
      return jsonResponse({ choices: [{ message: { content: "Hi there" } }] });
    }) as unknown as typeof fetch,
  });
  const sent = captured ? JSON.parse(String(captured.init.body)) : {};
  const headers = (captured?.init.headers ?? {}) as Record<string, string>;
  check("Plain text reply is returned", text.ok && text.data.content === "Hi there" && text.data.toolCalls.length === 0);
  check("URL is base + /chat/completions (trailing slash trimmed)", captured?.url === "https://api.example.test/v1/chat/completions", captured?.url);
  check("Sends bearer key, model, temperature 0.2", headers.Authorization === "Bearer test-key-not-real" && sent.model === "test-model" && sent.temperature === 0.2);
  check("Tools are sent in OpenAI function format", sent.tools?.[0]?.type === "function" && sent.tools[0].function.name === "listMyCourses");
  check("Request carries an abort signal (timeout)", captured?.init.signal instanceof AbortSignal);
  let noToolsBody: Record<string, unknown> = {};
  await chatCompletion({ messages }, { fetch: (async (_u: string, init: RequestInit) => { noToolsBody = JSON.parse(String(init.body)); return jsonResponse({ choices: [{ message: { content: "ok" } }] }); }) as unknown as typeof fetch });
  check("No tools key when no tools are given", !("tools" in noToolsBody));

  // Tool calls.
  const withCalls = await chatCompletion({ messages, tools: [tool] }, {
    fetch: (async () => jsonResponse({ choices: [{ message: { content: null, tool_calls: [
      { id: "call_1", type: "function", function: { name: "listMyCourses", arguments: "{}" } },
      { id: "call_2", type: "function", function: { name: "getTeacherSchedule", arguments: '{"from":"a","to":"b"}' } },
    ] } }] })) as typeof fetch,
  });
  check("Tool calls are parsed with ids, names and args", withCalls.ok && withCalls.data.toolCalls.length === 2 && withCalls.data.toolCalls[1].name === "getTeacherSchedule" && (withCalls.data.toolCalls[1].args as { from: string }).from === "a");
  check("Assistant message keeps the raw tool_calls for the next request", withCalls.ok && withCalls.data.message.tool_calls?.length === 2 && withCalls.data.message.tool_calls[0].function.arguments === "{}");
  const badJson = await chatCompletion({ messages }, {
    fetch: (async () => jsonResponse({ choices: [{ message: { content: null, tool_calls: [{ id: "c", type: "function", function: { name: "x", arguments: "{not json" } }] } }] })) as typeof fetch,
  });
  check("Invalid tool-argument JSON -> args null + argsError, no throw", badJson.ok && badJson.data.toolCalls[0].args === null && !!badJson.data.toolCalls[0].argsError);
  const emptyArgs = await chatCompletion({ messages }, {
    fetch: (async () => jsonResponse({ choices: [{ message: { content: null, tool_calls: [{ id: "c", type: "function", function: { name: "x", arguments: "" } }] } }] })) as typeof fetch,
  });
  check("Empty tool arguments become {}", emptyArgs.ok && JSON.stringify(emptyArgs.data.toolCalls[0].args) === "{}");

  // Failures never throw and never leak the key.
  for (const [status, expected] of [[401, "AI_API_KEY"], [429, "rate limiting"], [500, "try again"], [418, "418"]] as const) {
    const failed = await chatCompletion({ messages }, { fetch: (async () => jsonResponse({ error: "secret detail" }, status)) as typeof fetch });
    check(`HTTP ${status} -> friendly error`, !failed.ok && failed.error.message.includes(expected) && !failed.error.message.includes("secret detail") && !failed.error.message.includes("test-key-not-real"));
  }
  const empty = await chatCompletion({ messages }, { fetch: (async () => jsonResponse({ choices: [] })) as typeof fetch });
  check("Empty choices -> error", !empty.ok);
  const network = await chatCompletion({ messages }, { fetch: (async () => { throw new TypeError("fetch failed: secret-host"); }) as typeof fetch });
  check("Network failure -> friendly error without internals", !network.ok && !network.error.message.includes("secret-host"));
  const slow = await chatCompletion({ messages }, {
    timeoutMs: 50,
    fetch: ((_u: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    })) as typeof fetch,
  });
  check("Timeout -> friendly error", !slow.ok && slow.error.message.includes("did not respond"));

  console.info(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
