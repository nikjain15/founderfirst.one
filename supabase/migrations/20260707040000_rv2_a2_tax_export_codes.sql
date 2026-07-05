-- RV2-A2 — structured per-suite tax export: seeded per-suite import codes.
--
-- The structured export (Drake / UltraTax TB-import files, K-1 package spine) needs,
-- per return line, the code the tax SUITE expects in its import file. Those codes are
-- DATA — a suite's published code listing per form+year (research §B.5) — so they live
-- as a seeded column on tax_form_lines, NOT as literals in the app. The serializer
-- reads them via the codeMap; a code revision is a seed edit, zero code.
--
-- Additive, non-destructive: one nullable jsonb column. Existing lines default to an
-- empty map, and the serializer falls back to the display line_code when a suite has no
-- seeded code for a line — so the export degrades gracefully, never breaks.
--
-- Shape: { "drake": "S-08", "ultratax": "S-08" } keyed by the serializer suite id
-- (matches SERIALIZERS registry ids in apps/app/src/tax/serializers.ts). generic_csv /
-- generic_pdf carry no code (they emit the line_code/label spine directly).
--
-- WRITE-DON'T-DEPLOY (LEARNINGS #3): committed, not applied. Seeds regenerate via
-- scripts/seed-tax.ts into supabase/seeds/tax/_generated.sql (\i-included from seed.sql).

alter table public.tax_form_lines
  add column if not exists export_codes jsonb not null default '{}'::jsonb;

comment on column public.tax_form_lines.export_codes is
  'RV2-A2: per-suite tax-software import codes for this line, keyed by serializer suite '
  'id (drake/ultratax/…). DATA — a suite code revision is a seed edit, never an app '
  'literal. Absent ⇒ the serializer falls back to line_code (research §B.5).';
