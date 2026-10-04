import { recentEvents, subscribe } from "@/lib/ai/trace";
import { currentUserCanViewConsole } from "@/lib/ai/trace/viewer";

export const dynamic = "force-dynamic";

// GET /api/ai/trace/stream: server-sent events for the admin Agent Console.
// Only allowed users may connect; events carry step names and timings, never message content.
export async function GET(request: Request) {
  if (!(await currentUserCanViewConsole())) {
    return Response.json({ error: { code: "FORBIDDEN", message: "You do not have access to the Agent Console." } }, { status: 403 });
  }
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      for (const event of recentEvents().slice(-60)) send(event);
      unsubscribe = subscribe(send);
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), 15000);
      request.signal.addEventListener("abort", () => {
        unsubscribe?.();
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },
    cancel() {
      unsubscribe?.();
      clearInterval(heartbeat);
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
