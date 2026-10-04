import { err, ok, type Result } from "@/contracts";

// Turns an uploaded teaching file into plain text. Only the text is kept (the original file is not
// stored), so students and the assistant read exactly what the teacher sees in the preview.

export const MAX_FILE_BYTES = 8 * 1024 * 1024;
/** A material holds at most 20,000 characters; stay below that so a split never lands on the limit. */
export const MAX_MATERIAL_CHARS = 18_000;
export const MAX_PARTS = 5;
export const ACCEPTED_EXTENSIONS = [".txt", ".md", ".markdown", ".pdf", ".docx"] as const;

export type FileKind = "text" | "pdf" | "docx";

export function fileKindOf(fileName: string): FileKind | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".markdown")) return "text";
  return null;
}

export function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return (base || "Uploaded file").slice(0, 70);
}

function startsWith(bytes: Uint8Array, signature: string): boolean {
  return signature.split("").every((char, index) => bytes[index] === char.charCodeAt(0));
}

function clean(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Reads the text out of a .txt, .md, .pdf or .docx file. Never throws. */
export async function extractText(fileName: string, bytes: Uint8Array): Promise<Result<{ kind: FileKind; text: string }>> {
  const kind = fileKindOf(fileName);
  if (!kind) return err("VALIDATION", `That file type is not supported. Use ${ACCEPTED_EXTENSIONS.join(", ")}.`);
  if (bytes.byteLength === 0) return err("VALIDATION", "That file is empty.");
  if (bytes.byteLength > MAX_FILE_BYTES) return err("VALIDATION", `That file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB. Split it or paste the text instead.`);
  try {
    let text: string;
    if (kind === "text") {
      text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } else if (kind === "pdf") {
      if (!startsWith(bytes, "%PDF")) return err("VALIDATION", "That file does not look like a PDF.");
      const { extractText: readPdf, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const result = await readPdf(pdf, { mergePages: true });
      text = Array.isArray(result.text) ? result.text.join("\n\n") : result.text;
    } else {
      if (!startsWith(bytes, "PK")) return err("VALIDATION", "That file does not look like a Word (.docx) document. Older .doc files are not supported.");
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      text = result.value;
    }
    const cleaned = clean(text);
    if (cleaned.length === 0) {
      return err("VALIDATION", kind === "pdf" ? "No readable text was found. A scanned or image-only PDF needs OCR first." : "No readable text was found in that file.");
    }
    return ok({ kind, text: cleaned });
  } catch {
    return err("VALIDATION", "That file could not be read. It may be damaged or password-protected.");
  }
}

/** Splits long text into parts of at most `max` characters, preferring paragraph, then line, then sentence breaks. */
export function splitIntoParts(text: string, max = MAX_MATERIAL_CHARS): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const floor = Math.floor(max * 0.5);
    let cut = Math.max(window.lastIndexOf("\n\n"), -1);
    if (cut < floor) cut = window.lastIndexOf("\n");
    if (cut < floor) cut = window.lastIndexOf(". ") + 1;
    if (cut < floor) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.length > 0) parts.push(rest);
  return parts;
}
