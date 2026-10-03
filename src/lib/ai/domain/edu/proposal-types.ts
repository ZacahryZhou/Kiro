import {
  ProposalPayloadSchemas,
  type ProposalPayloads,
} from "@/contracts";
import { createMemoryProposalStore } from "../../core/proposal-store";
import { createProposalService, type ProposalRegistry } from "../../core/proposals";
import { describeInstant } from "../../core/time";
import * as services from "../../services";

// Maps each proposal type to its payload schema, the service function that runs on confirmation,
// and a code-generated preview. "Re-skinning" the agent for another domain replaces this file.

const STATUS_LABEL = { PRESENT: "Present", LEAVE: "Leave", ABSENT: "Absent" } as const;

/** Charges follow contract 6.1: present and absent cost one session, leave costs none. */
export function sessionsDeducted(status: "PRESENT" | "LEAVE" | "ABSENT"): number {
  return status === "LEAVE" ? 0 : 1;
}

async function describeAttendance(
  actor: Parameters<typeof services.getTeacherSchedule>[0],
  payload: ProposalPayloads["MARK_ATTENDANCE"],
): Promise<string[]> {
  const now = Date.now();
  const schedule = await services.getTeacherSchedule(actor, {
    from: new Date(now - 90 * 86_400_000).toISOString(),
    to: new Date(now + 90 * 86_400_000).toISOString(),
  });
  const session = schedule.ok ? schedule.data.sessions.find((s) => s.id === payload.sessionId) : undefined;
  const roster = session ? await services.listMyStudents(actor, { courseId: session.courseId }) : undefined;
  const names = new Map(roster?.ok ? roster.data.students.map((s) => [s.id, s.name]) : []);
  const when = session ? describeInstant(session.startAt) : undefined;
  return [
    session && when ? `${session.courseName}, ${when.weekday} ${when.localDate} ${when.localTime}` : "Attendance",
    ...payload.records.map((r) => {
      const n = sessionsDeducted(r.status);
      return `${names.get(r.studentId) ?? r.studentId}: ${STATUS_LABEL[r.status]} (${n} ${n === 1 ? "session" : "sessions"} deducted)`;
    }),
  ];
}

export const eduProposalHandlers: ProposalRegistry = {
  MARK_ATTENDANCE: {
    schema: ProposalPayloadSchemas.MARK_ATTENDANCE,
    execute: (actor, payload) => services.confirmAttendance(actor, payload),
    describe: describeAttendance,
  },
};

export const proposalStore = createMemoryProposalStore();
export const eduProposals = createProposalService(eduProposalHandlers, proposalStore);
