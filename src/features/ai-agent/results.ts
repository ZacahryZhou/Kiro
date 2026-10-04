import type { ProposalType } from "@/contracts";
import { labels } from "@/lib/ai/domain/edu/labels";

type Outcome = { email?: string; status?: string; message?: string };

const STUDENT_OUTCOME: Record<string, string> = {
  ADDED: labels.result.studentAdded,
  ALREADY_JOINED: labels.result.studentAlreadyJoined,
  NOT_REGISTERED: labels.result.studentNotRegistered,
  FAILED: labels.result.studentFailed,
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Short lines describing what a confirmed proposal did, built from the confirm response. */
export function resultLines(type: ProposalType, result: unknown): string[] {
  const data = (result ?? {}) as Record<string, unknown>;
  if (type === "CREATE_COURSE" && Array.isArray(data.students)) {
    return (data.students as Outcome[]).map((s) => `${s.email}: ${STUDENT_OUTCOME[s.status ?? ""] ?? s.status ?? ""}`);
  }
  if (type === "MARK_ATTENDANCE" && Array.isArray(data.attendance)) {
    const deductions = Array.isArray(data.deductions) ? data.deductions.length : 0;
    return [`${plural(data.attendance.length, "attendance record", "attendance records")}, ${plural(deductions, "session deducted", "sessions deducted")}`];
  }
  if (type === "CREATE_SESSIONS" && Array.isArray(data.sessionIds)) {
    return [plural(data.sessionIds.length, "session scheduled", "sessions scheduled")];
  }
  if (type === "PROGRESS_RECORD" && typeof data.studentName === "string") {
    return [`Progress saved for ${data.studentName}`];
  }
  if (type === "RESCHEDULE" && typeof data.newStartAt === "string") {
    return ["Session moved"];
  }
  if (type === "DASHBOARD_LAYOUT" && typeof data.name === "string") {
    return [`${labels.dashboard.saved}: "${data.name}"`];
  }
  if (type === "ADD_STUDENT") {
    return [data.alreadyJoined === true ? labels.result.studentAlreadyJoined : labels.result.studentAdded];
  }
  return [];
}
