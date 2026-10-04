import { handleChat } from "@/lib/ai/chat-handler";

// POST /api/ai/chat: one conversation turn with the AI assistant (contract section 9).
export async function POST(request: Request) {
  return handleChat(request);
}
