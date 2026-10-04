// Runs every offline AI check (fake services, no network, no key) and prints one summary.
// Run: npx tsx src/lib/ai/dev/run-all.ts
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const CHECKS = [
  "fake-check", "provider-check", "tools-check", "agent-check", "proposals-check", "routes-check",
  "student-check", "chat-check", "schedule-check", "policy-check", "lesson-prep-check", "mock-check", "trace-check", "reschedule-check",
];

// Offline checks must run on the fake services: they pick them when NODE_ENV is unset.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "NODE_ENV"));

let total = 0;
const failed: string[] = [];
for (const name of CHECKS) {
  const run = spawnSync("npx", ["tsx", join("src", "lib", "ai", "dev", `${name}.ts`)], { encoding: "utf8", env: env as NodeJS.ProcessEnv });
  const output = `${run.stdout}${run.stderr}`;
  const passed = (output.match(/^PASS/gm) ?? []).length;
  const bad = (output.match(/^FAIL/gm) ?? []).length;
  total += passed;
  const ok = run.status === 0 && bad === 0;
  if (!ok) {
    failed.push(name);
    process.stdout.write(output);
  }
  console.info(`${ok ? "ok  " : "FAIL"}  ${name.padEnd(18)} ${passed} passed${bad ? `, ${bad} failed` : ""}`);
}
console.info(failed.length === 0 ? `\nAll ${CHECKS.length} check scripts passed (${total} checks).` : `\nFailed: ${failed.join(", ")}`);
process.exitCode = failed.length === 0 ? 0 : 1;
