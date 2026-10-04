import { z } from "zod";
import type { Citation } from "@/contracts";
import type { chatCompletion } from "./provider";

// Answers a question from source texts and lets CODE verify every citation. The model only drafts
// the answer; an answer is accepted only when each cited source exists and each quote is a literal
// (whitespace-normalised) substring of that source. Anything else becomes "not found".

export type CitationSource = { materialId: string; unitId: string; title: string; content: string };

export type VerifiedAnswer =
  | { found: true; answer: string; citations: Citation[] }
  | { found: false };

const MIN_QUOTE_CHARS = 8;
const MAX_ANSWER_CHARS = 1500;

const modelAnswer = z.object({
  found: z.boolean(),
  answer: z.string().default(""),
  citations: z
    .array(z.object({ materialId: z.string(), quote: z.string() }))
    .default([]),
});

/**
 * Compares text the way a person reads it: spacing, letter case, curly versus straight quotes, dashes,
 * ellipsis marks and invisible characters do not matter. Words and numbers still have to match exactly.
 */
const collapse = (text: string) =>
  text
    .normalize("NFKC")
    .replace(/[\u200b-\u200d\u00ad\ufeff]/g, "")
    .replace(/[\u2018\u2019\u201a\u2032]/g, "'")
    .replace(/[\u201c\u201d\u201e\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();

/** Extracts the first JSON object from model text (it may be wrapped in code fences or prose). */
export function parseJsonObject(text: string): unknown | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function verifyAnswer(raw: unknown, sources: CitationSource[]): VerifiedAnswer {
  const parsed = modelAnswer.safeParse(raw);
  if (!parsed.success || !parsed.data.found) return { found: false };
  const { answer, citations } = parsed.data;
  if (answer.trim() === "" || citations.length === 0) return { found: false };

  const verified: Citation[] = [];
  for (const citation of citations) {
    const source = sources.find((s) => s.materialId === citation.materialId);
    const quote = collapse(citation.quote);
    if (!source || quote.length < MIN_QUOTE_CHARS || !collapse(source.content).includes(quote)) {
      return { found: false }; // one bad citation rejects the whole answer
    }
    verified.push({ materialId: source.materialId, unitId: source.unitId, title: source.title, quote: citation.quote.replace(/\s+/g, " ").trim() });
  }
  return { found: true, answer: answer.trim().slice(0, MAX_ANSWER_CHARS), citations: verified };
}

/**
 * Asks the model to answer from the given sources, then verifies the citations in code.
 * The sources are sent as JSON data so text inside them cannot break out of its place.
 */
export async function answerWithCitations(params: {
  question: string;
  sources: CitationSource[];
  system: string;
  complete: typeof chatCompletion;
  /** Extra data sent beside the sources, such as a teacher's teaching style. It is data, never instructions. */
  extra?: Record<string, unknown>;
}): Promise<VerifiedAnswer> {
  if (params.sources.length === 0) return { found: false };
  const ask = (note?: string) =>
    params.complete({
      messages: [
        { role: "system", content: params.system },
        {
          role: "user",
          content: JSON.stringify({
            question: params.question,
            ...(params.extra ?? {}),
            materials: params.sources.map(({ materialId, title, content }) => ({ materialId, title, content })),
          }),
        },
        ...(note ? [{ role: "system" as const, content: note }] : []),
      ],
    });
  const attempt = async (note?: string): Promise<VerifiedAnswer> => {
    const completion = await ask(note);
    if (!completion.ok || !completion.data.content) return { found: false };
    return verifyAnswer(parseJsonObject(completion.data.content), params.sources);
  };
  const first = await attempt();
  if (first.found) return first;
  // Models often shorten or reword a quote. One more try, told to copy it exactly, before saying "not found".
  return attempt(
    "System note (not from the user): your previous answer was rejected because a quote was not copied word for word from its material, or no quote was given. " +
      "If the materials do answer the question, answer again and give each quote as a short exact copy (one sentence or less) of text that appears in that material. " +
      "If they do not answer it, return found: false.",
  );
}
