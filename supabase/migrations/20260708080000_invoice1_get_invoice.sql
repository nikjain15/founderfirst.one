-- =============================================================================
-- INVOICE-1 — Invoice document + viewer (Slice 1 of the invoicing rework).
-- BACKLOG.md "## INVOICE-1". docs/plans/INVOICING_REWORK.md.
--
-- The owner-facing invoice list (W4.3) never let anyone VIEW a finished
-- invoice as a document — the biggest presentational gap Nik flagged 6 Jul
-- ("you can't view them"). This migration adds the one thing genuinely
-- missing to support a viewer: a single-invoice read (header + ordered
-- lines) alongside its lines. Pure additive; no write-path change.
--
-- Read-only RPC, same shape as the existing `invoice_ar_aging` read: SQL
-- language, STABLE, SECURITY DEFINER, gated on can_access_org (no p_actor —
-- this never writes), granted directly to `authenticated` (the app calls it
-- client-side, same trust boundary as the existing direct `invoices` select).
-- =============================================================================

create or replace function get_invoice(p_org uuid, p_invoice_id uuid)
returns table (
  id                uuid,
  number            text,
  status            invoice_status,
  customer_name     text,
  customer_email    text,
  issue_date        date,
  due_date          date,
  currency          char(3),
  memo              text,
  total_minor       bigint,
  amount_paid_minor bigint,
  sent_at           timestamptz,
  lines             jsonb
)
language sql stable security definer set search_path = public as $$
  select i.id, i.number, i.status, i.customer_name, i.customer_email,
         i.issue_date, i.due_date, i.currency, i.memo,
         i.total_minor, i.amount_paid_minor, i.sent_at,
         coalesce(
           (select jsonb_agg(jsonb_build_object(
              'id', l.id,
              'description', l.description,
              'quantity_milli', l.quantity_milli,
              'unit_price_minor', l.unit_price_minor,
              'amount_minor', l.amount_minor
            ) order by l.position, l.id)
            from invoice_lines l
            where l.invoice_id = i.id),
           '[]'::jsonb
         ) as lines
  from invoices i
  where i.id = p_invoice_id
    and i.org_id = p_org
    and can_access_org(p_org);
$$;

revoke all on function get_invoice(uuid, uuid) from public;
grant execute on function get_invoice(uuid, uuid) to authenticated;
