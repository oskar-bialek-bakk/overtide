import { useQuery } from "@tanstack/react-query";
import type {
  Balance,
  EarningIssue,
  RedemptionIssue,
  SyncRun,
} from "@overtide/shared";
import { apiFetch } from "./client";

export const qk = {
  health: ["health"] as const,
  balance: ["balance"] as const,
  timeline: ["balance", "timeline"] as const,
  earning: ["issues", "earning"] as const,
  redemption: ["issues", "redemption"] as const,
  unlinked: ["unlinked"] as const,
  issue: (id: number) => ["issue", id] as const,
  syncHistory: ["sync", "history"] as const,
};

export type HealthData = {
  redmine: "ok" | "unreachable" | "auth_failed" | "rest_disabled";
  db: "ok";
  lastSync: string | null;
  errors: { code: string; message: string }[];
};

export type TimelinePoint = {
  date: string;
  earned: number;
  redeemed: number;
  cumulative: number;
};

export type IssueDetail = {
  issue: unknown;
  timeEntries: unknown[];
  relations: unknown[];
};

export const useHealth = () =>
  useQuery({
    queryKey: qk.health,
    queryFn: () => apiFetch<HealthData>("/api/health"),
    refetchInterval: 30_000,
  });

export const useBalance = () =>
  useQuery({
    queryKey: qk.balance,
    queryFn: () => apiFetch<Balance>("/api/balance"),
  });

export const useTimeline = () =>
  useQuery({
    queryKey: qk.timeline,
    queryFn: () => apiFetch<TimelinePoint[]>("/api/balance/timeline"),
  });

export const useEarning = () =>
  useQuery({
    queryKey: qk.earning,
    queryFn: () => apiFetch<EarningIssue[]>("/api/issues/earning"),
  });

export const useRedemption = () =>
  useQuery({
    queryKey: qk.redemption,
    queryFn: () => apiFetch<RedemptionIssue[]>("/api/issues/redemption"),
  });

export const useUnlinked = () =>
  useQuery({
    queryKey: qk.unlinked,
    queryFn: () => apiFetch<RedemptionIssue[]>("/api/unlinked"),
  });

export const useSyncHistory = () =>
  useQuery({
    queryKey: qk.syncHistory,
    queryFn: () => apiFetch<SyncRun[]>("/api/sync/history?limit=20"),
  });

export const useIssue = (id: number) =>
  useQuery({
    queryKey: qk.issue(id),
    queryFn: () => apiFetch<IssueDetail>(`/api/issues/${id}`),
    enabled: Number.isFinite(id),
  });
