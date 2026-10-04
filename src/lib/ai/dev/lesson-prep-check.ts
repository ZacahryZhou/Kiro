/* eslint-disable @typescript-eslint/no-explicit-any -- injected provider boundary */
// Deterministic test for generated lesson drafts; no provider key or network is used.
import { ok } from "@/contracts";
import { eduProposals } from "../domain/edu/proposal-types";
import { findTool } from "../domain/edu/tools";
import { getCourseMaterials } from "../services";
import { actorFor, ids, resetStore, store } from "./fake-store";

const alex = actorFor("teacher1@example.test")!;
const draft = {
  lessonNotes: "Review how a linear function can be written as y = kx + b. Model one example, ask students to identify the slope, then practise isolating a variable with inverse operations.",
  exercises: ["Solve 2x + 4 = 10.", "Solve 3x - 5 = 7.", "Find the slope in y = 4x + 2.", "Write a rule for a line with slope 2 and intercept 1.", "Explain how to check a solution by substitution."],
};

async function main() {
  resetStore();
  const unitsBefore = store.units.length;
  let modelInput = "";
  const result = await findTool("TEACHER", "proposeLessonPrep")!.run(
    alex,
    { courseId: ids.courseA, topic: "Linear Functions", sessionDate: "2031-03-04" },
    {
      complete: (async ({ messages }: { messages: { role: string; content: string }[] }) => {
        modelInput = messages[1].content;
        return ok({ content: JSON.stringify(draft), toolCalls: [], message: { role: "assistant", content: JSON.stringify(draft) } });
      }) as any,
    },
  );
  if (!result.ok || result.proposal?.type !== "ADD_CONTENT" || result.proposal.status !== "pending") throw new Error("Lesson prep did not produce a pending ADD_CONTENT proposal.");
  if (!result.proposal.preview?.some((line) => line.includes("Model one example"))) throw new Error("The pending proposal preview did not show the lesson draft for review.");
  if (store.units.length !== unitsBefore) throw new Error("Lesson prep changed course content before confirmation.");
  if (/Jordan Lee|Sam Patel|Unavailable Tuesday|Struggles with functions/.test(modelInput)) throw new Error("Lesson generation prompt disclosed student identity or private memory text.");
  const saved = await eduProposals.confirm(alex, result.proposal.id);
  if (!saved.ok || saved.data.status !== "executed") throw new Error("Confirming lesson prep did not write content.");
  const materials = await getCourseMaterials(alex, { courseId: ids.courseA });
  const content = materials.ok ? materials.data.units.flatMap((unit) => unit.materials).find((material) => material.title === "Lesson Guide and Practice")?.content : undefined;
  if (!content || (content.match(/^\d+\./gm) ?? []).length !== 5) throw new Error("Confirmed lesson draft is missing its five practice questions.");
  console.info("PASS lesson prep generates a pending ADD_CONTENT proposal");
  console.info("PASS private student identity and memory content are not sent to the generator");
  console.info("PASS the confirmation card preview contains the lesson draft for teacher review");
  console.info("PASS the guide and exactly five practice questions are saved only after confirmation");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Lesson prep check failed.");
  process.exitCode = 1;
});
