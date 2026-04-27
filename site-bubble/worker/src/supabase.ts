/**
 * Thin wrapper over Supabase REST. We don't pull in @supabase/supabase-js to
 * keep the Worker bundle tiny — these two endpoints are all we need.
 *
 * RLS is on; only the service-role key bypasses it. Never expose the key
 * client-side.
 */

interface ChatRow {
  session_id: string;
  turn_index: number;
  role: "user" | "penny";
  message: string;
  cta_emitted?: boolean;
  tone?: string | null;
  on_waitlist?: boolean;
  soft_decline?: boolean;
  buying_signal?: boolean;
  user_agent?: string | null;
  referrer?: string | null;
  page_url?: string | null;
}

interface LeadRow {
  session_id: string;
  kind: "email" | "phone";
  value: string;
  source: "waitlist" | "follow_up" | "volunteered";
  user_agent?: string | null;
  referrer?: string | null;
  page_url?: string | null;
}

export class Supabase {
  constructor(private url: string, private serviceKey: string) {}

  private async post(table: string, row: object, extraHeaders: Record<string, string> = {}) {
    const res = await fetch(`${this.url}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        apikey: this.serviceKey,
        Authorization: `Bearer ${this.serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
        ...extraHeaders,
      },
      body: JSON.stringify(row),
    });
    if (!res.ok && res.status !== 409) {
      // 409 = unique-violation on leads; we want it to be a no-op.
      const body = await res.text();
      throw new Error(`Supabase ${table} insert failed (${res.status}): ${body}`);
    }
  }

  logChat(row: ChatRow) {
    return this.post("penny_site_chats", row);
  }

  logLead(row: LeadRow) {
    // resolution=ignore-duplicates lets us no-op when (session_id, kind, value)
    // already exists, instead of erroring.
    return this.post("penny_site_leads", row, {
      Prefer: "return=minimal,resolution=ignore-duplicates",
    });
  }
}
