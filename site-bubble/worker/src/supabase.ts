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

  /**
   * Fetch the currently live system prompt via the get_live_prompt() RPC.
   * Returns null if no live row is set (caller should fall back to a baked-in
   * default). Throws on transport errors.
   */
  async getLivePrompt(): Promise<{ id: string; version: number; body: string; updated_at: string } | null> {
    const res = await fetch(`${this.url}/rest/v1/rpc/get_live_prompt`, {
      method: "POST",
      headers: {
        apikey: this.serviceKey,
        Authorization: `Bearer ${this.serviceKey}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`get_live_prompt failed (${res.status}): ${body}`);
    }
    const rows = (await res.json()) as Array<{ id: string; version: number; body: string; updated_at: string }>;
    return rows[0] ?? null;
  }

  /**
   * Fetch the currently live voice guide via the get_live_voice() RPC.
   * Returns null when nothing is published yet — caller skips the voice
   * preface in that case. Throws on transport errors.
   */
  async getLiveVoice(): Promise<{ id: string; version: number; body: string; updated_at: string } | null> {
    const res = await fetch(`${this.url}/rest/v1/rpc/get_live_voice`, {
      method: "POST",
      headers: {
        apikey: this.serviceKey,
        Authorization: `Bearer ${this.serviceKey}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`get_live_voice failed (${res.status}): ${body}`);
    }
    const rows = (await res.json()) as Array<{ id: string; version: number; body: string; updated_at: string }>;
    return rows[0] ?? null;
  }
}
