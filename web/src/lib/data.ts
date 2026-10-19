import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Account, Me, Person, Platform, Rule } from "./types";

export const useMe = () => useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/me"), retry: false });
export const usePeople = () => useQuery({ queryKey: ["profiles"], queryFn: () => api<Person[]>("/profiles") });
export const usePlatforms = () => useQuery({ queryKey: ["platforms"], queryFn: () => api<Platform[]>("/platforms") });
export const useAccounts = () => useQuery({ queryKey: ["accounts"], queryFn: () => api<Account[]>("/accounts") });
export const useRules = () => useQuery({ queryKey: ["rules"], queryFn: () => api<Rule[]>("/rules") });

/** Invalidate everything content-related after a mutation. */
export function useRefresh() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["targets"] });
    qc.invalidateQueries({ queryKey: ["post"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

export function usePeopleMap() {
  const { data } = usePeople();
  return new Map((data ?? []).map((p) => [p.id, p]));
}

/** Active members, the only people who can be assigned content work. */
export function useMembers() {
  const { data } = usePeople();
  return (data ?? []).filter((p) => p.active && p.role === "member");
}

/** Accounts members can post to: active and on a platform the admin has left visible. */
export function usePostableAccounts() {
  const { data } = useAccounts();
  return (data ?? []).filter((a) => a.active && a.platform_visible);
}

/** Group key for an account: its account name, falling back to the handle. */
export const accountName = (a: { display_name: string | null; handle: string }) => a.display_name || a.handle;
