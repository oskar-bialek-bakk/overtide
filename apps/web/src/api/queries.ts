import {
  balanceSchema,
  earningIssueSchema,
  healthDataSchema,
  issueDetailSchema,
  redemptionIssueSchema,
  syncRunSchema,
  syncStatusSchema,
  timelinePointSchema,
} from "@overtide/shared";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetchSchema } from "./client";

export const qk = {
  health: ["health"] as const,
  balance: ["balance"] as const,
  timeline: ["balance", "timeline"] as const,
  earning: ["issues", "earning"] as const,
  redemption: ["issues", "redemption"] as const,
  unlinked: ["unlinked"] as const,
  issue: (id: number) => ["issue", id] as const,
  syncHistory: ["sync", "history"] as const,
  syncStatus: ["sync", "status"] as const,
};

export const useHealth = () =>
  useQuery({
    queryKey: qk.health,
    queryFn: () => apiFetchSchema("/api/health", healthDataSchema),
    refetchInterval: 30_000,
  });

export const useBalance = () =>
  useQuery({
    queryKey: qk.balance,
    queryFn: () => apiFetchSchema("/api/balance", balanceSchema),
  });

export const useTimeline = () =>
  useQuery({
    queryKey: qk.timeline,
    queryFn: () => apiFetchSchema("/api/balance/timeline", z.array(timelinePointSchema)),
  });

export const useEarning = () =>
  useQuery({
    queryKey: qk.earning,
    queryFn: () => apiFetchSchema("/api/issues/earning", z.array(earningIssueSchema)),
  });

export const useRedemption = () =>
  useQuery({
    queryKey: qk.redemption,
    queryFn: () => apiFetchSchema("/api/issues/redemption", z.array(redemptionIssueSchema)),
  });

export const useUnlinked = () =>
  useQuery({
    queryKey: qk.unlinked,
    queryFn: () => apiFetchSchema("/api/unlinked", z.array(redemptionIssueSchema)),
  });

export const useSyncHistory = () =>
  useQuery({
    queryKey: qk.syncHistory,
    queryFn: () => apiFetchSchema("/api/sync/history?limit=20", z.array(syncRunSchema)),
  });

export const useSyncStatus = () =>
  useQuery({
    queryKey: qk.syncStatus,
    queryFn: () => apiFetchSchema("/api/sync/status", syncStatusSchema),
    refetchInterval: 30_000,
  });

export const useIssue = (id: number) =>
  useQuery({
    queryKey: qk.issue(id),
    queryFn: () => apiFetchSchema(`/api/issues/${id}`, issueDetailSchema),
    enabled: Number.isFinite(id),
  });
