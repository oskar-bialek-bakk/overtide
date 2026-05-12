import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiClientError, apiFetch } from "./client";
import { qk } from "./queries";

export type SyncResult = {
  id: number;
  status: string;
  issuesUpserted: number;
  timeEntriesUpserted: number;
  relationsUpserted: number;
};

export function useRunSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<SyncResult>("/api/sync", { method: "POST" }),
    onSuccess: (r) => {
      toast.success(
        `Synced — ${r.issuesUpserted} issues, ${r.timeEntriesUpserted} entries`,
      );
      qc.invalidateQueries();
    },
    onError: (e) => {
      if (e instanceof ApiClientError && e.code === "SYNC_IN_PROGRESS") {
        toast.warning("A sync is already running");
        return;
      }
      toast.error(
        e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e),
      );
    },
  });
}

export type CreateRelationVars = {
  from_earning_id: number;
  to_redemption_id: number;
  /** Optional hour override; omit for greedy FIFO. */
  allocated_hours?: number | null;
};

export type CreateRelationResult = {
  id: number;
  status: "CREATED" | "ALREADY_LINKED";
};

// Pass `skipInvalidate: true` when calling from a bulk caller (e.g. linking
// many earnings to one redemption in a loop) and run `invalidateRelationQueries`
// once after the loop to avoid N rounds of refetch.
export function useCreateRelation(opts: { skipInvalidate?: boolean } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: CreateRelationVars) =>
      apiFetch<CreateRelationResult>("/api/relations", {
        method: "POST",
        body: vars,
      }),
    onSuccess: () => {
      if (opts.skipInvalidate) return;
      invalidateRelationQueries(qc);
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e),
      ),
  });
}

export function invalidateRelationQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: qk.unlinked });
  qc.invalidateQueries({ queryKey: qk.balance });
  qc.invalidateQueries({ queryKey: qk.earning });
  qc.invalidateQueries({ queryKey: qk.redemption });
}
