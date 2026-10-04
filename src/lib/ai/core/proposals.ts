import type { z } from "zod";
import {
  err,
  ok,
  type Actor,
  type ProposalPayloads,
  type ProposalStatus,
  type ProposalType,
  type ProposalView,
  type Result,
  type ServiceError,
} from "@/contracts";
import type { ProposalRecord, ProposalStore } from "./proposal-store";

// The proposal state machine (contract section 9): pending -> confirmed -> executed | failed, or
// pending -> discarded. Business data changes only inside a handler's `execute`, and only after
// confirmation. This file contains no education-specific words; the domain supplies the handlers.

export type ProposalHandler<P> = {
  /** Validates the payload before a proposal is created and again before it is executed. */
  schema: z.ZodType<P>;
  /** Calls the real (or fake) service function. Runs only after the teacher confirms. */
  execute: (actor: Actor, payload: P) => Promise<Result<unknown>>;
  /** Human-readable preview lines, computed by code. */
  describe: (actor: Actor, payload: P) => Promise<string[]>;
};

export type ProposalRegistry = { [T in ProposalType]?: ProposalHandler<ProposalPayloads[T]> };

export type ConfirmOutcome = {
  status: "executed" | "failed";
  result?: unknown;
  error?: ServiceError;
};

export function toView(record: ProposalRecord, preview?: string[]): ProposalView {
  return {
    id: record.id,
    type: record.type,
    summary: record.summary,
    payload: record.payload,
    status: record.status,
    createdAt: record.createdAt,
    ...(preview ? { preview } : {}),
  };
}

export function createProposalService(registry: ProposalRegistry, store: ProposalStore) {
  const handlerFor = (type: ProposalType) =>
    registry[type] as ProposalHandler<unknown> | undefined;

  /** Loads a proposal and checks that it belongs to the actor. */
  async function loadOwn(actor: Actor, id: string): Promise<Result<ProposalRecord>> {
    const record = await store.get(id);
    if (!record) return err("NOT_FOUND", "Proposal not found.");
    if (record.actorId !== actor.userId) {
      return err("FORBIDDEN", "You do not have access to this proposal.");
    }
    return ok(record);
  }

  const existingOutcome = (record: ProposalRecord): Result<ConfirmOutcome> => {
    if (record.status === "executed") return ok({ status: "executed", result: record.result });
    if (record.status === "failed") return ok({ status: "failed", error: record.error });
    if (record.status === "discarded") {
      return err("CONFLICT", "This proposal was discarded and can no longer be confirmed.");
    }
    return err("CONFLICT", "This proposal is already being confirmed.");
  };

  /** Preview lines for a record; a failure to build them never blocks the proposal itself. */
  async function previewFor(actor: Actor, record: ProposalRecord): Promise<string[] | undefined> {
    const handler = handlerFor(record.type);
    if (!handler) return undefined;
    try {
      return await handler.describe(actor, record.payload);
    } catch {
      return undefined;
    }
  }

  return {
    /** Validates the payload, then stores a pending proposal. Business data is not touched. */
    async create(input: {
      actor: Actor;
      type: ProposalType;
      payload: unknown;
      courseId?: string;
      summary: string;
    }): Promise<Result<ProposalView>> {
      const handler = handlerFor(input.type);
      if (!handler) return err("VALIDATION", `Proposals of type ${input.type} are not supported yet.`);
      const parsed = handler.schema.safeParse(input.payload);
      if (!parsed.success) {
        return err("VALIDATION", "The proposal is not valid.", parsed.error.issues);
      }
      const record = await store.insert({
        type: input.type,
        actorId: input.actor.userId,
        courseId: input.courseId,
        payload: parsed.data,
        summary: input.summary,
      });
      return ok(toView(record, await previewFor(input.actor, record)));
    },

    async describe(actor: Actor, id: string): Promise<Result<string[]>> {
      const loaded = await loadOwn(actor, id);
      if (!loaded.ok) return loaded;
      const handler = handlerFor(loaded.data.type);
      if (!handler) return err("INTERNAL", "This proposal type is not supported.");
      return ok(await handler.describe(actor, loaded.data.payload));
    },

    async list(actor: Actor, status?: ProposalStatus): Promise<ProposalView[]> {
      const records = await store.listByActor(actor.userId, status);
      return Promise.all(records.map(async (r) => toView(r, await previewFor(actor, r))));
    },

    /** The actor's own proposals among `ids`, in the order given. Other people's ids are silently skipped. */
    async listByIds(actor: Actor, ids: string[]): Promise<ProposalView[]> {
      const views: ProposalView[] = [];
      for (const id of [...new Set(ids)].slice(0, 100)) {
        const record = await store.get(id);
        if (record && record.actorId === actor.userId) views.push(toView(record, await previewFor(actor, record)));
      }
      return views;
    },

    /** Confirmation steps from contract section 9. Executes at most once. */
    async confirm(actor: Actor, id: string): Promise<Result<ConfirmOutcome>> {
      const loaded = await loadOwn(actor, id);
      if (!loaded.ok) return loaded;
      if (loaded.data.status !== "pending") return existingOutcome(loaded.data);

      // Only one concurrent caller can move pending -> confirmed; the rest get the existing state.
      const claimed = await store.transition(id, "pending", {
        status: "confirmed",
        confirmedAt: new Date().toISOString(),
      });
      if (!claimed) {
        const current = await store.get(id);
        return current ? existingOutcome(current) : err("NOT_FOUND", "Proposal not found.");
      }

      const finish = async (patch: {
        status: "executed" | "failed";
        result?: unknown;
        error?: ServiceError;
      }): Promise<Result<ConfirmOutcome>> => {
        await store.update(id, { ...patch, executedAt: new Date().toISOString() });
        return ok(
          patch.status === "executed"
            ? { status: "executed", result: patch.result }
            : { status: "failed", error: patch.error },
        );
      };

      const handler = handlerFor(claimed.type);
      if (!handler) {
        return finish({ status: "failed", error: { code: "INTERNAL", message: "This proposal type is not supported." } });
      }
      const parsed = handler.schema.safeParse(claimed.payload);
      if (!parsed.success) {
        return finish({ status: "failed", error: { code: "VALIDATION", message: "The proposal is not valid.", details: parsed.error.issues } });
      }
      try {
        const result = await handler.execute(actor, parsed.data);
        return result.ok
          ? finish({ status: "executed", result: result.data })
          : finish({ status: "failed", error: result.error });
      } catch {
        return finish({ status: "failed", error: { code: "INTERNAL", message: "The action failed unexpectedly. Nothing was confirmed." } });
      }
    },

    async discard(actor: Actor, id: string): Promise<Result<{ status: "discarded" }>> {
      const loaded = await loadOwn(actor, id);
      if (!loaded.ok) return loaded;
      const moved = await store.transition(id, "pending", { status: "discarded" });
      if (!moved) return err("CONFLICT", "Only pending proposals can be discarded.");
      return ok({ status: "discarded" });
    },
  };
}

export type ProposalService = ReturnType<typeof createProposalService>;
