/**
 * Platform-staff data access (ARCHITECTURE.md §4.2). Staff are NOT tenant members,
 * so every read goes through a self-gating security-definer RPC: the directory is
 * staff-only, and a tenant's books are readable ONLY while a break-glass window is
 * open. Opening/closing a window is audited server-side. The UI gate here is a
 * courtesy — the database is the control.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "../lib/supabase";
import type { JournalEntry, LedgerAccount } from "../ledger/types";

export interface StaffOrg {
  id: string; name: string; type: string; created_at: string; entry_count: number;
}
export interface BreakGlassWindow {
  id: string; org_id: string; org_name: string; reason: string;
  opened_at: string; expires_at: string; closed_at: string | null; active: boolean;
}

/**
 * A support ticket, exactly the shape the founderfirst.one/admin inbox reads.
 * SAME source of truth as the live admin: the `list_tickets` SECURITY-DEFINER RPC
 * over `support_tickets`/`support_contacts` (apps/admin/src/lib/supabase.ts →
 * listTickets). No duplicate data path — the console mirrors, it does not fork.
 */
export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
export interface StaffTicket {
  id: string;
  status: TicketStatus;
  priority: "p1" | "p2" | "p3";
  channel: "discord" | "web";
  subject: string;
  first_message: string;
  contact_email: string | null;
  contact_discord: string | null;
  topic: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export function useIsPlatformStaff() {
  return useQuery({
    queryKey: ["is-platform-staff"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await getClient().rpc("is_platform_staff");
      if (error) throw error;
      return Boolean(data);
    },
  });
}

export function useStaffOrgs(enabled = true) {
  return useQuery({
    queryKey: ["staff-orgs"],
    enabled,
    queryFn: async (): Promise<StaffOrg[]> => {
      const { data, error } = await getClient().rpc("staff_list_orgs");
      if (error) throw error;
      return (data ?? []) as StaffOrg[];
    },
  });
}

/**
 * Support tickets for the console's Support tab. Reads the SAME `list_tickets`
 * RPC the live admin inbox reads — one source of truth, no fork. Any platform
 * staff is on the admins allow-list, so the RPC's auth check passes for them.
 * `status` mirrors the admin inbox's status filter (undefined = all).
 */
export function useStaffTickets(status: TicketStatus | undefined, enabled = true) {
  return useQuery({
    queryKey: ["staff-tickets", status ?? "all"],
    enabled,
    queryFn: async (): Promise<StaffTicket[]> => {
      const { data, error } = await getClient().rpc("list_tickets", {
        p_status: status ?? null,
      });
      if (error) throw error;
      return (data ?? []) as StaffTicket[];
    },
  });
}

export function useStaffBreakGlass(enabled = true) {
  return useQuery({
    queryKey: ["staff-break-glass"],
    enabled,
    refetchInterval: 30_000, // keep the active-window countdown fresh
    queryFn: async (): Promise<BreakGlassWindow[]> => {
      const { data, error } = await getClient().rpc("staff_list_break_glass");
      if (error) throw error;
      return (data ?? []) as BreakGlassWindow[];
    },
  });
}

export function useStaffAccounts(orgId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["staff-accounts", orgId],
    enabled: Boolean(orgId) && enabled,
    queryFn: async (): Promise<LedgerAccount[]> => {
      const { data, error } = await getClient().rpc("staff_list_accounts", { p_org: orgId });
      if (error) throw error;
      return (data ?? []) as LedgerAccount[];
    },
  });
}

export function useStaffEntries(orgId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["staff-entries", orgId],
    enabled: Boolean(orgId) && enabled,
    queryFn: async (): Promise<JournalEntry[]> => {
      const { data, error } = await getClient().rpc("staff_list_entries", { p_org: orgId });
      if (error) throw error;
      return ((data ?? []) as unknown as JournalEntry[]);
    },
  });
}

export function useStaffRefresh() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["staff-break-glass"] });
    void qc.invalidateQueries({ queryKey: ["staff-accounts"] });
    void qc.invalidateQueries({ queryKey: ["staff-entries"] });
  };
}

export function useOpenBreakGlass() {
  return useMutation({
    mutationFn: async (v: { orgId: string; reason: string; minutes: number }) => {
      const { data, error } = await getClient().rpc("open_break_glass", {
        p_org: v.orgId, p_reason: v.reason, p_minutes: v.minutes,
      });
      if (error) throw new Error(error.message);
      return data as BreakGlassWindow;
    },
  });
}

export function useCloseBreakGlass() {
  return useMutation({
    mutationFn: async (grantId: string) => {
      const { error } = await getClient().rpc("close_break_glass", { p_grant: grantId });
      if (error) throw new Error(error.message);
    },
  });
}

// ── Console modules — read-only staff data (Audience / Analytics / Penny) ─────
export interface WaitlistRow {
  email: string; source: string | null; referred_by: string | null; signed_up_at: string | null;
}
export function useStaffWaitlist(enabled = true) {
  return useQuery({
    queryKey: ["staff-waitlist"],
    enabled,
    queryFn: async (): Promise<WaitlistRow[]> => {
      const { data, error } = await getClient().rpc("staff_list_waitlist", { p_limit: 200 });
      if (error) throw new Error(error.message);
      return (data ?? []) as WaitlistRow[];
    },
  });
}

export interface AuditRow {
  id: string; actor_email: string | null; action: string;
  target_type: string | null; target_id: string | null; created_at: string;
}
export function useStaffAdminAudit(enabled = true) {
  return useQuery({
    queryKey: ["staff-admin-audit"],
    enabled,
    queryFn: async (): Promise<AuditRow[]> => {
      const { data, error } = await getClient().rpc("staff_list_admin_audit", { p_limit: 200 });
      if (error) throw new Error(error.message);
      return (data ?? []) as AuditRow[];
    },
  });
}

export interface PlatformStats {
  orgs: number; pending_signups: number; waitlist: number;
  open_tickets: number; live_posts: number; live_pages: number;
}
export function useStaffPlatformStats(enabled = true) {
  return useQuery({
    queryKey: ["staff-platform-stats"],
    enabled,
    queryFn: async (): Promise<PlatformStats | null> => {
      const { data, error } = await getClient().rpc("staff_platform_stats");
      if (error) throw new Error(error.message);
      return (data ?? null) as PlatformStats | null;
    },
  });
}

export interface ContentRow { slug: string; surface: string; kind: string; updated_at: string | null; }
export function useStaffContent(enabled = true) {
  return useQuery({
    queryKey: ["staff-content"],
    enabled,
    queryFn: async (): Promise<ContentRow[]> => {
      const { data, error } = await getClient().rpc("staff_list_content");
      if (error) throw new Error(error.message);
      return (data ?? []) as ContentRow[];
    },
  });
}

// ── Signup approval queue (staff) ─────────────────────────────────────────────
export interface PendingOrg {
  id: string; name: string; type: string; created_at: string; owner_email: string | null;
}

export function useStaffPendingOrgs(enabled = true) {
  return useQuery({
    queryKey: ["staff-pending-orgs"],
    enabled,
    queryFn: async (): Promise<PendingOrg[]> => {
      const { data, error } = await getClient().rpc("staff_list_pending_orgs");
      if (error) throw new Error(error.message);
      return (data ?? []) as PendingOrg[];
    },
  });
}

export function useSetOrgApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { orgId: string; status: "approved" | "declined" }) => {
      const { error } = await getClient().rpc("set_org_approval", {
        p_org: v.orgId, p_status: v.status,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["staff-pending-orgs"] });
      void qc.invalidateQueries({ queryKey: ["staff-orgs"] });
    },
  });
}
