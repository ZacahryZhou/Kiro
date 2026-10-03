import type { ProposalStatus, ProposalType, ServiceError } from "@/contracts";

// Storage for proposals (the AgentProposal table). The in-memory version is for development;
// the Prisma version at H6 implements the same interface, with `transition` as
// updateMany({ where: { id, status: from } }) and a check of the updated row count.

export type ProposalRecord = {
  id: string;
  type: ProposalType;
  actorId: string;
  courseId?: string;
  payload: unknown;
  summary: string;
  status: ProposalStatus;
  result?: unknown;
  error?: ServiceError;
  createdAt: string;
  confirmedAt?: string;
  executedAt?: string;
};

export type ProposalPatch = Partial<
  Pick<ProposalRecord, "status" | "result" | "error" | "confirmedAt" | "executedAt">
>;

export interface ProposalStore {
  insert(record: Omit<ProposalRecord, "id" | "createdAt" | "status">): Promise<ProposalRecord>;
  get(id: string): Promise<ProposalRecord | undefined>;
  listByActor(actorId: string, status?: ProposalStatus): Promise<ProposalRecord[]>;
  /** Atomically moves a proposal from `from` to a new state. Returns null when it was not in `from`. */
  transition(id: string, from: ProposalStatus, patch: ProposalPatch & { status: ProposalStatus }): Promise<ProposalRecord | null>;
  update(id: string, patch: ProposalPatch): Promise<ProposalRecord | undefined>;
}

export function createMemoryProposalStore(): ProposalStore & { clear(): void } {
  const records = new Map<string, ProposalRecord>();
  let counter = 0;
  return {
    async insert(input) {
      counter += 1;
      const record: ProposalRecord = {
        ...input,
        id: `prop_${counter}`,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      records.set(record.id, record);
      return { ...record };
    },
    async get(id) {
      const record = records.get(id);
      return record ? { ...record } : undefined;
    },
    async listByActor(actorId, status) {
      return [...records.values()]
        .filter((r) => r.actorId === actorId && (!status || r.status === status))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
        .map((r) => ({ ...r }));
    },
    // The check and the write happen with no await in between, so only one caller can win.
    async transition(id, from, patch) {
      const record = records.get(id);
      if (!record || record.status !== from) return null;
      Object.assign(record, patch);
      return { ...record };
    },
    async update(id, patch) {
      const record = records.get(id);
      if (!record) return undefined;
      Object.assign(record, patch);
      return { ...record };
    },
    clear() {
      records.clear();
    },
  };
}
