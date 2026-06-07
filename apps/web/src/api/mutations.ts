import { type CreateRedemptionRequest, createRedemptionResponseSchema } from "@overtide/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { ApiClientError, apiFetchSchema } from "./client";
import { qk } from "./queries";

const syncResultSchema = z.object({
  id: z.number().int().positive(),
  status: z.literal("success"),
  issuesUpserted: z.number(),
  timeEntriesUpserted: z.number(),
  relationsUpserted: z.number(),
  relationsSkippedUnknownIssue: z.number(),
  relationsSkippedSameRole: z.number(),
  overtimeOnRedemptionIgnored: z.number(),
});

export type SyncResult = z.infer<typeof syncResultSchema>;

export function useRunSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetchSchema("/api/sync", syncResultSchema, { method: "POST" }),
    onSuccess: (r) => {
      toast.success(`Synced - ${r.issuesUpserted} issues, ${r.timeEntriesUpserted} entries`);
      qc.invalidateQueries();
    },
    onError: (e) => {
      if (e instanceof ApiClientError && e.code === "SYNC_IN_PROGRESS") {
        toast.warning("A sync is already running");
        return;
      }
      toast.error(e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e));
    },
  });
}

export type CreateRelationVars = {
  from_earning_id: number;
  to_redemption_id: number;
  /** Optional hour override; omit for greedy FIFO. */
  allocated_hours?: number | null;
};

const createRelationResultSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(["CREATED", "ALREADY_LINKED"]),
});

export type CreateRelationResult = z.infer<typeof createRelationResultSchema>;

// Pass `skipInvalidate: true` when calling from a bulk caller (e.g. linking
// many earnings to one redemption in a loop) and run `invalidateRelationQueries`
// once after the loop to avoid N rounds of refetch.
export function useCreateRelation(opts: { skipInvalidate?: boolean } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: CreateRelationVars) =>
      apiFetchSchema("/api/relations", createRelationResultSchema, {
        method: "POST",
        body: vars,
      }),
    onSuccess: () => {
      if (opts.skipInvalidate) return;
      invalidateRelationQueries(qc);
    },
    onError: (e) =>
      toast.error(e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e)),
  });
}

export function invalidateRelationQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: qk.unlinked });
  qc.invalidateQueries({ queryKey: qk.balance });
  qc.invalidateQueries({ queryKey: qk.earning });
  qc.invalidateQueries({ queryKey: qk.redemption });
}

export function useCreateRedemption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: CreateRedemptionRequest) =>
      apiFetchSchema("/api/redemptions/create", createRedemptionResponseSchema, {
        method: "POST",
        body: vars,
      }),
    onSuccess: (r) => {
      if (r.warning) {
        toast.warning(`Created #${r.issueId} with warnings - ${r.warning}`);
      } else {
        toast.success(`Created #${r.issueId} - ${r.subject}`);
      }
      invalidateRelationQueries(qc);
      qc.invalidateQueries({ queryKey: qk.timeline });
      qc.invalidateQueries({ queryKey: qk.syncHistory });
    },
    onError: (e) =>
      toast.error(e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e)),
  });
}

const retryRedemptionOperationResultSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(["success", "partial"]),
  retriedTimeEntries: z.number(),
  retriedRelations: z.number(),
  warning: z.string().optional(),
});

export type RetryRedemptionOperationResult = z.infer<typeof retryRedemptionOperationResultSchema>;

export function useRetryRedemptionOperation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetchSchema(
        `/api/redemptions/operations/${id}/retry`,
        retryRedemptionOperationResultSchema,
        {
          method: "POST",
        },
      ),
    onSuccess: (r) => {
      if (r.status === "success") {
        toast.success(
          `Retry completed - ${r.retriedTimeEntries} entries, ${r.retriedRelations} relations`,
        );
      } else {
        toast.warning(`Retry still has warnings - ${r.warning ?? "check Redmine"}`);
      }
      invalidateRelationQueries(qc);
      qc.invalidateQueries({ queryKey: qk.timeline });
      qc.invalidateQueries({ queryKey: qk.syncHistory });
    },
    onError: (e) =>
      toast.error(e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e)),
  });
}
