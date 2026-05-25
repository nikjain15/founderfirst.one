/**
 * Supabase client + ticket RPC wrappers.
 *
 * RPCs called here all require an authenticated session (see SCHEMA.sql).
 * Magic-link login happens in Login.tsx; the resulting JWT travels with
 * every RPC call automatically once the client is initialized.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, hasSupabase } from "./env";

let client: SupabaseClient | null = null;

export function getClient(): SupabaseClient {
  if (!hasSupabase) {
    throw new Error(
      "Supabase env vars missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.",
    );
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

// ---- Types matching the RPC return shapes ----------------------------------

export interface TicketRow {
  id: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "p1" | "p2" | "p3";
  channel: "discord" | "web";
  subject: string;
  first_message: string;
  contact_email: string | null;
  contact_discord: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface TicketMessage {
  id: string;
  author: "user" | "bot" | "admin";
  body: string;
  created_at: string;
}

export interface TicketDetail {
  ticket: {
    id: string;
    status: TicketRow["status"];
    priority: TicketRow["priority"];
    channel: TicketRow["channel"];
    channel_thread_ref: string;
    subject: string;
    first_message: string;
    created_at: string;
    updated_at: string;
    resolved_at: string | null;
    bot_confidence: string | null;
    bot_reason: string | null;
    contact_email: string | null;
    contact_discord: string | null;
  };
  messages: TicketMessage[];
}

// ---- RPC wrappers ----------------------------------------------------------

export async function listTickets(status?: TicketRow["status"]): Promise<TicketRow[]> {
  const db = getClient();
  const { data, error } = await db.rpc("list_tickets", { p_status: status ?? null });
  if (error) throw new Error(`list_tickets: ${error.message}`);
  return (data as TicketRow[]) ?? [];
}

export async function getTicket(ticketId: string): Promise<TicketDetail> {
  const db = getClient();
  const { data, error } = await db.rpc("get_ticket", { p_ticket_id: ticketId });
  if (error) throw new Error(`get_ticket: ${error.message}`);
  return data as TicketDetail;
}

export interface AnalyticsSnapshot {
  now: string;
  open_count: number;
  in_progress: number;
  stale_count: number;
  resolved_7d: number;
  opened_7d: number;
  avg_first_response_minutes_7d: number | null;
  opens_by_day: Array<{ day: string; count: number }>;
  resolves_by_day: Array<{ day: string; count: number }>;
  channel_30d: Partial<Record<"discord" | "web", number>>;
  priority_30d: Partial<Record<"p1" | "p2" | "p3", number>>;
}

export async function getAnalytics(): Promise<AnalyticsSnapshot> {
  const db = getClient();
  const { data, error } = await db.rpc("get_analytics");
  if (error) throw new Error(`get_analytics: ${error.message}`);
  return data as AnalyticsSnapshot;
}

export async function replyToTicket(
  ticketId: string,
  body: string,
  resolve: boolean,
): Promise<string> {
  const db = getClient();
  const { data, error } = await db.rpc("reply_to_ticket", {
    p_ticket_id: ticketId,
    p_body: body,
    p_resolve: resolve,
  });
  if (error) throw new Error(`reply_to_ticket: ${error.message}`);
  return data as string;
}
