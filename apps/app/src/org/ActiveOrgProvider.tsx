/**
 * Active-org context: the org-switcher's selection + the effective role/lens for
 * that org. The lens is a UI PROJECTION only — real authorization is enforced by
 * RLS (reads) and the write-path API (mutations), never by which component renders
 * (ARCHITECTURE.md §1, §4). Role is derived from the user's own membership/
 * engagement rows, all of which are RLS-readable.
 *
 * Hardening follow-up: collapse the three reads into one server-authoritative
 * `app_my_orgs()` RPC (returns orgs + role + access). Kept client-side here to
 * avoid a schema change mid-UI-iteration.
 */
import {
  createContext, useContext, useEffect, useMemo, useState, type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { getClient } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

export type OrgType = "business" | "firm";
export type MemberRole = "owner" | "member" | "firm_admin" | "cpa";
export type Access = "read_only" | "full";
export type Lens = "owner" | "cpa";

export interface Org { id: string; name: string; type: OrgType; }
export interface RoleInfo {
  lens: Lens;
  role: MemberRole;
  access: Access;
  canWrite: boolean;
  via: "membership" | "engagement";
}

interface Membership { org_id: string; role: MemberRole; }
interface Engagement { client_org_id: string; access: Access; }

interface ActiveOrgState {
  orgs: Org[];
  loading: boolean;
  error: boolean;
  activeOrg: Org | null;
  roleInfo: RoleInfo | null;
  setActiveOrgId: (id: string) => void;
}

const ACTIVE_ORG_KEY = "ff.activeOrg";
const Ctx = createContext<ActiveOrgState | null>(null);

export function useActiveOrg(): ActiveOrgState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useActiveOrg must be used within ActiveOrgProvider");
  return v;
}

function deriveRole(
  org: Org,
  memberships: Membership[],
  engagements: Engagement[],
): RoleInfo | null {
  const m = memberships.find((x) => x.org_id === org.id);
  if (m) {
    if (m.role === "owner" || m.role === "member") {
      return { lens: "owner", role: m.role, access: "full", canWrite: true, via: "membership" };
    }
    // firm_admin / cpa viewing their own firm (the practice itself)
    return { lens: "cpa", role: m.role, access: "full", canWrite: true, via: "membership" };
  }
  const e = engagements.find((x) => x.client_org_id === org.id);
  if (e) {
    return { lens: "cpa", role: "cpa", access: e.access, canWrite: e.access === "full", via: "engagement" };
  }
  return null;
}

export function ActiveOrgProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const query = useQuery({
    queryKey: ["active-org-data", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const sb = getClient();
      const [orgsRes, memRes, engRes] = await Promise.all([
        sb.from("organizations").select("id,name,type").order("name"),
        sb.from("memberships").select("org_id,role").eq("user_id", userId),
        sb.from("engagements").select("client_org_id,access").eq("status", "active"),
      ]);
      if (orgsRes.error) throw orgsRes.error;
      if (memRes.error) throw memRes.error;
      if (engRes.error) throw engRes.error;
      return {
        orgs: (orgsRes.data ?? []) as Org[],
        memberships: (memRes.data ?? []) as Membership[],
        engagements: (engRes.data ?? []) as Engagement[],
      };
    },
  });

  const orgs = useMemo(() => query.data?.orgs ?? [], [query.data]);
  const [activeOrgId, setActiveOrgId] = useState<string>(
    () => localStorage.getItem(ACTIVE_ORG_KEY) ?? "",
  );

  useEffect(() => {
    if (!activeOrgId && orgs.length > 0) setActiveOrgId(orgs[0].id);
  }, [orgs, activeOrgId]);
  useEffect(() => {
    if (activeOrgId) localStorage.setItem(ACTIVE_ORG_KEY, activeOrgId);
  }, [activeOrgId]);

  const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? null;
  const roleInfo = useMemo<RoleInfo | null>(() => {
    if (!activeOrg || !query.data) return null;
    return deriveRole(activeOrg, query.data.memberships, query.data.engagements);
  }, [activeOrg, query.data]);

  const value: ActiveOrgState = {
    orgs,
    loading: query.isLoading,
    error: query.isError,
    activeOrg,
    roleInfo,
    setActiveOrgId,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
