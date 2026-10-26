import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Account, Brand, Dashboard, Me, Person, Platform, Topic } from "./types";
import { addDays, startOfDay } from "./dates";

export const useMe = () => useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/me"), retry: false });
export const usePeople = () => useQuery({ queryKey: ["profiles"], queryFn: () => api<Person[]>("/profiles") });
export const usePlatforms = () => useQuery({ queryKey: ["platforms"], queryFn: () => api<Platform[]>("/platforms") });
/** Brands (what people call accounts) with their platform profiles and managers. */
export const useBrands = () => useQuery({ queryKey: ["brands"], queryFn: () => api<Brand[]>("/brands") });
/** Topics in sidebar order, each with its starter template and open-post count. */
export const useTopics = () => useQuery({ queryKey: ["topics"], queryFn: () => api<Topic[]>("/topics") });

/** Sidebar and My work counts: open posts planned today, and my open versions. */
export function useDashboard() {
  const today = startOfDay(new Date()).getTime();
  return useQuery({
    queryKey: ["dashboard", today],
    queryFn: () => api<Dashboard>(`/dashboard?from=${today}&to=${addDays(new Date(today), 1).getTime()}`),
    refetchInterval: 5 * 60_000, // light on the free database quota; any change refreshes it anyway
  });
}

/** Invalidate everything post-related after a change. */
export function useRefresh() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["posts"] });
    qc.invalidateQueries({ queryKey: ["post"] });
    qc.invalidateQueries({ queryKey: ["topics"] }); // open counts in the sidebar
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

export function usePeopleMap() {
  const { data } = usePeople();
  return useMemo(() => new Map((data ?? []).map((p) => [p.id, p])), [data]);
}

/** Active people, admins included: anyone who can be assigned work. */
export function useTeam() {
  const { data } = usePeople();
  return useMemo(() => (data ?? []).filter((p) => p.active && !p.deleted), [data]);
}

export type PostableAccount = Account & { brand_name: string };

/** Platform profiles members can post to: the brand is active and the admin hasn't hidden the platform. */
export function usePostableBrands() {
  const { data } = useBrands();
  return useMemo(
    () =>
      (data ?? [])
        .filter((b) => b.active)
        .map((b) => ({ ...b, accounts: b.accounts.filter((a) => a.platform_visible) }))
        .filter((b) => b.accounts.length),
    [data],
  );
}

/** Every live platform profile, flattened, with its brand's name. */
export function useAllAccounts(): PostableAccount[] {
  const { data } = useBrands();
  return useMemo(
    () => (data ?? []).flatMap((b) => b.accounts.map((a) => ({ ...a, brand_name: b.name }))),
    [data],
  );
}

/**
 * The default "Posted by" for an account: its manager, while they're active.
 * Until people have loaded, the manager is used as is.
 */
export function postsByOf(accounts: Account[], id: number, team: Person[]) {
  const manager = accounts.find((a) => a.id === id)?.manager_id ?? null;
  return manager && (!team.length || team.some((m) => m.id === manager)) ? manager : null;
}
