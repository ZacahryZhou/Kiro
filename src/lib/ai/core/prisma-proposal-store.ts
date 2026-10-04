import { Prisma, type AgentProposal } from "@prisma/client";
import type { ProposalStatus, ProposalType, ServiceError } from "@/contracts";
import { prisma } from "@/lib/db/prisma";
import type { ProposalPatch, ProposalRecord, ProposalStore } from "./proposal-store";

function decodeError(value: string | null): ServiceError | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === "object" && parsed !== null &&
      "code" in parsed && typeof parsed.code === "string" &&
      "message" in parsed && typeof parsed.message === "string"
    ) return parsed as ServiceError;
  } catch {
    // Older rows may contain a plain-text error.
  }
  return { code: "INTERNAL", message: value };
}

function toRecord(row: AgentProposal): ProposalRecord {
  return {
    id: row.id,
    type: row.type as ProposalType,
    actorId: row.actorId,
    courseId: row.courseId ?? undefined,
    payload: row.payload,
    summary: row.summary,
    status: row.status as ProposalStatus,
    result: row.result === null ? undefined : row.result,
    error: decodeError(row.error),
    createdAt: row.createdAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString(),
    executedAt: row.executedAt?.toISOString(),
  };
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** Prisma-backed AgentProposal storage for the application runtime. */
export const prismaProposalStore: ProposalStore = {
  async insert(input) {
    const row = await prisma.agentProposal.create({
      data: {
        type: input.type,
        actorId: input.actorId,
        courseId: input.courseId,
        payload: json(input.payload),
        summary: input.summary,
      },
    });
    return toRecord(row);
  },

  async get(id) {
    const row = await prisma.agentProposal.findUnique({ where: { id } });
    return row ? toRecord(row) : undefined;
  },

  async listByActor(actorId, status) {
    const rows = await prisma.agentProposal.findMany({
      where: { actorId, status },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 200,
    });
    return rows.map(toRecord);
  },

  async transition(id, from, patch) {
    const updated = await prisma.agentProposal.updateMany({
      where: { id, status: from },
      data: {
        status: patch.status,
        confirmedAt: patch.confirmedAt ? new Date(patch.confirmedAt) : undefined,
        executedAt: patch.executedAt ? new Date(patch.executedAt) : undefined,
        ...(patch.result !== undefined ? { result: json(patch.result) } : {}),
        ...(patch.error !== undefined ? { error: JSON.stringify(patch.error) } : {}),
      },
    });
    if (updated.count === 0) return null;
    const row = await prisma.agentProposal.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  },

  async update(id, patch: ProposalPatch) {
    const updated = await prisma.agentProposal.updateMany({
      where: { id },
      data: {
        status: patch.status,
        confirmedAt: patch.confirmedAt ? new Date(patch.confirmedAt) : undefined,
        executedAt: patch.executedAt ? new Date(patch.executedAt) : undefined,
        ...(patch.result !== undefined ? { result: json(patch.result) } : {}),
        ...(patch.error !== undefined ? { error: JSON.stringify(patch.error) } : {}),
      },
    });
    if (updated.count === 0) return undefined;
    const row = await prisma.agentProposal.findUnique({ where: { id } });
    return row ? toRecord(row) : undefined;
  },
};
