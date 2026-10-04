// Assertion script for turning uploaded files into text (no database, no network).
// Run: npx tsx src/lib/ai/dev/file-text-check.ts
import { makeDocx, makePdf } from "./file-fixtures";
import { MAX_FILE_BYTES, extractText, fileKindOf, splitIntoParts, titleFromFileName } from "@/lib/file-text";

let failures = 0;
function check(name: string, condition: boolean, extra?: unknown) {
  if (!condition) failures += 1;
  const detail = condition || extra === undefined ? "" : ` -> ${JSON.stringify(extra)}`;
  console.info(`${condition ? "PASS" : "FAIL"}  ${name}${detail}`);
}

async function main() {
  const enc = (text: string) => new TextEncoder().encode(text);

  check("File kinds are recognised by extension", fileKindOf("a.PDF") === "pdf" && fileKindOf("a.docx") === "docx" && fileKindOf("a.md") === "text" && fileKindOf("a.txt") === "text" && fileKindOf("a.doc") === null && fileKindOf("a.exe") === null);
  check("A title comes from the file name", titleFromFileName("Linear_equations-week 3.pdf") === "Linear equations week 3" && titleFromFileName("C:\\x\\notes.txt") === "notes");

  const txt = await extractText("notes.txt", enc("Line one.\r\n\r\n\r\n\r\nLine two.  \n"));
  check("A text file is read and tidied", txt.ok && txt.data.text === "Line one.\n\nLine two.", txt);
  const md = await extractText("notes.md", enc("# Fractions\n\nA **fraction** has a numerator."));
  check("A markdown file is read as is", md.ok && md.data.text.includes("# Fractions"));
  const pdf = await extractText("lesson.pdf", makePdf("Subtract b from both sides then divide by a"));
  check("A PDF's text is extracted", pdf.ok && pdf.data.kind === "pdf" && pdf.data.text.includes("Subtract b from both sides"), pdf);
  const docx = await extractText("lesson.docx", await makeDocx(["Quadratic formula", "x equals minus b plus or minus root of b squared minus 4ac, over 2a"]));
  check("A Word file's paragraphs are extracted", docx.ok && docx.data.kind === "docx" && docx.data.text.includes("Quadratic formula") && docx.data.text.includes("over 2a"), docx);

  const scanned = await extractText("scan.pdf", makePdf(""));
  check("A PDF with no text explains that OCR is needed", !scanned.ok && /OCR/.test(scanned.error.message), scanned);
  check("A text file that is only spaces is refused", !(await extractText("blank.txt", enc("   \n\n  "))).ok);
  check("An empty file is refused", !(await extractText("empty.txt", new Uint8Array(0))).ok);
  check("An unsupported type is refused", !(await extractText("virus.exe", enc("x"))).ok && !(await extractText("old.doc", enc("x"))).ok);
  check("A fake PDF is refused", !(await extractText("fake.pdf", enc("not a pdf"))).ok);
  check("A fake Word file is refused", !(await extractText("fake.docx", enc("not a zip"))).ok);
  check("A damaged PDF is refused without throwing", !(await extractText("broken.pdf", enc("%PDF-1.4 garbage"))).ok);
  check("A file over the size limit is refused", !(await extractText("big.txt", new Uint8Array(MAX_FILE_BYTES + 1))).ok);

  // ----- splitting -----
  check("Short text is one part", splitIntoParts("short").length === 1);
  const paragraph = "Sentence about fractions. ".repeat(40).trim();
  const long = Array.from({ length: 60 }, () => paragraph).join("\n\n");
  const parts = splitIntoParts(long, 5000);
  check("Long text splits into parts under the limit", parts.length > 1 && parts.every((p) => p.length <= 5000), parts.map((p) => p.length));
  check("Splitting loses no text", parts.join("\n\n").replace(/\s+/g, " ") === long.replace(/\s+/g, " "));
  check("Splitting prefers paragraph breaks", parts.slice(0, -1).every((p) => p.endsWith("fractions.")));
  check("Text with no breaks still splits", splitIntoParts("x".repeat(12_000), 5000).length === 3);

  console.info(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
