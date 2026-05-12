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
};

export type CreateRelationResult = {
  id: number;
  status: "CREATED" | "ALREADY_LINKED";
};

export function useCreateRelation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: CreateRelationVars) =>
      apiFetch<CreateRelationResult>("/api/relations", {
        method: "POST",
        body: vars,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.unlinked });
      qc.invalidateQueries({ queryKey: qk.balance });
      qc.invalidateQueries({ queryKey: qk.earning });
      qc.invalidateQueries({ queryKey: qk.redemption });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e),
      ),
  });
}
