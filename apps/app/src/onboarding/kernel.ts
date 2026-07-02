/**
 * Kernel reads for onboarding (W3.3). The entity + industry OPTIONS the wizard
 * shows come from the CENTRAL-2 knowledge kernel (entity_types / industries),
 * NEVER a hardcoded list — adding a row makes a new tile appear. These tables are
 * public-read (RLS select-to-authenticated), so we read them directly under the
 * caller's JWT, like the chart of accounts.
 */
import { useQuery } from "@tanstack/react-query";
import { getClient } from "../lib/supabase";
import type { EntityTypeSeed } from "./diagnostic";

export interface IndustrySeed {
  key: string;
  label: string;
  icon: string | null;
  coa_template_ref: string | null;
  sort_order: number;
}

export function useEntityTypes() {
  return useQuery({
    queryKey: ["kernel-entity-types"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<EntityTypeSeed[]> => {
      const sb = getClient();
      const { data, error } = await sb
        .from("entity_types")
        .select("key,label,short_label,description,diagnostic_questions,sort_order")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as EntityTypeSeed[];
    },
  });
}

export function useIndustries() {
  return useQuery({
    queryKey: ["kernel-industries"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<IndustrySeed[]> => {
      const sb = getClient();
      const { data, error } = await sb
        .from("industries")
        .select("key,label,icon,coa_template_ref,sort_order")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as IndustrySeed[];
    },
  });
}
