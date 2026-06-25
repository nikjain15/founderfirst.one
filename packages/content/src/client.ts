/**
 * Content access — the typed surface both Astro (build/live render) and the
 * admin editor use. Thin wrapper over the security-definer RPCs in
 * migration 20260624110000_content_model.sql. RLS does the enforcement; this
 * layer re-validates every untrusted DB payload with Zod before handing it on.
 *
 *   - getPublishedPage()  → anon-safe, used by Astro
 *   - getActiveEmail()    → used by email-dispatch
 *   - list/draft/publish  → admin editor (RPC raises unless is_admin())
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { Page, EmailTemplate, FaqEntry, type Surface } from "./schema";

export interface PageSummary { slug: string; surface: string; version: number; is_live: boolean; updated_at: string; }
export interface VersionRow { id: string; version: number; payload: unknown; notes: string | null; is_live: boolean; created_at: string; created_by_email: string | null; }
export interface EmailSummary { event: string; version: number; is_live: boolean; updated_at: string; }

export interface ContentClient {
  /** Published page for a slug — Zod-validated. Returns null if none live. */
  getPublishedPage(slug: string): Promise<Page | null>;
  /** Active email template for a semantic event — used by email-dispatch. */
  getActiveEmail(event: string): Promise<EmailTemplate | null>;

  /** Admin: one row per page slug (editor index). */
  listPages(): Promise<PageSummary[]>;
  /** Admin: version history for a slug, newest first. */
  listPageVersions(slug: string): Promise<VersionRow[]>;
  /** Admin: save a new (non-live) draft. Payload is validated before send. */
  draftPage(slug: string, surface: Surface, payload: Page, notes?: string): Promise<string>;
  /** Admin: promote a page version to live (fires the rebuild webhook). */
  publishPage(versionId: string): Promise<void>;

  /** Admin email equivalents. */
  listEmails(): Promise<EmailSummary[]>;
  listEmailVersions(event: string): Promise<VersionRow[]>;
  draftEmail(event: string, payload: EmailTemplate, notes?: string): Promise<string>;
  publishEmail(versionId: string): Promise<void>;
}

export function createContentClient(supabase: SupabaseClient): ContentClient {
  const call = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw new Error(`[@ff/content] ${fn}: ${error.message}`);
    return data as T;
  };

  return {
    async getPublishedPage(slug) {
      const rows = await call<Array<{ payload: unknown }>>("get_live_page", { p_slug: slug });
      if (!rows?.length) return null;
      return Page.parse(rows[0].payload); // re-validate untrusted DB payload
    },
    async getActiveEmail(event) {
      const rows = await call<Array<{ payload: unknown }>>("get_active_email", { p_event: event });
      if (!rows?.length) return null;
      return EmailTemplate.parse(rows[0].payload);
    },
    listPages: () => call<PageSummary[]>("list_content_pages", {}),
    listPageVersions: (slug) => call<VersionRow[]>("list_page_versions", { p_slug: slug }),
    draftPage: (slug, surface, payload, notes) =>
      call<string>("create_page_version", {
        p_slug: slug, p_surface: surface, p_payload: Page.parse(payload), p_notes: notes ?? null,
      }),
    publishPage: (versionId) => call<void>("set_live_page", { p_id: versionId }),
    listEmails: () => call<EmailSummary[]>("list_content_emails", {}),
    listEmailVersions: (event) => call<VersionRow[]>("list_email_versions", { p_event: event }),
    draftEmail: (event, payload, notes) =>
      call<string>("create_email_version", {
        p_event: event, p_payload: EmailTemplate.parse(payload), p_notes: notes ?? null,
      }),
    publishEmail: (versionId) => call<void>("set_live_email", { p_id: versionId }),
  };
}

/** Pull FAQ entries out of a page's sections → FAQPage JSON-LD + llms.txt. */
export function extractFaqs(page: Page): FaqEntry[] {
  return page.sections.flatMap((s) => (s.type === "faq" ? s.data.entries : []));
}
