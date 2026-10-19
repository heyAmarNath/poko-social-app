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
