/**
 * Unit + fixture tests for scripts/check-definer-tenant-guard.ts — the guard
 * born from the 6-Jul weekly audit (PR #301) / SEC-3 (PR #309): a SECURITY
 * DEFINER read RPC granted to authenticated that takes an org-scoping
 * parameter with no membership check leaks every tenant's data. Run:
 * `pnpm test:guards`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  matchParen,
  parseFunctions,
  findDefinerTenantProblems,
} from "../check-definer-tenant-guard.ts";

test("matchParen: finds the matching close paren, ignoring nested parens", () => {
  const text = "foo(a numeric(10,2), b uuid) returns int";
  const open = text.indexOf("(");
  assert.equal(matchParen(text, open), text.indexOf(") returns"));
});

test("matchParen: returns -1 when unbalanced", () => {
  assert.equal(matchParen("foo(a uuid", 3), -1);
});

test("parseFunctions: extracts name, params, header, body, and definer flag", () => {
  const sql = `
create or replace function public.my_reader(p_org_id uuid, p_year int)
returns table (x int)
  language sql stable security definer set search_path = public as $$
  select 1;
$$;
`;
  const defs = parseFunctions(sql, "fixture.sql");
  assert.equal(defs.length, 1);
  assert.equal(defs[0].name, "my_reader");
  assert.match(defs[0].params, /p_org_id uuid/);
  assert.equal(defs[0].isDefiner, true);
  assert.match(defs[0].body, /select 1;/);
});

test("parseFunctions: a security invoker function is not flagged as definer", () => {
  const sql = `
create or replace function public.plain_fn(p_org_id uuid)
returns int language sql stable as $$ select 1; $$;
`;
  const defs = parseFunctions(sql, "fixture.sql");
  assert.equal(defs[0].isDefiner, false);
});

test("parseFunctions: handles a non-'$$' dollar-quote tag (e.g. $body$)", () => {
  const sql = `
create or replace function public.tagged_fn(p_org uuid)
returns int language plpgsql security definer set search_path = public as $body$
begin
  return 1;
end;
$body$;
`;
  const defs = parseFunctions(sql, "fixture.sql");
  assert.equal(defs.length, 1);
  assert.match(defs[0].body, /return 1;/);
});

/** Build a scratch supabase/migrations/ dir the way the real repo is laid out. */
function makeFixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "check-definer-tenant-guard-"));
  mkdirSync(join(root, "supabase/migrations"), { recursive: true });
  return root;
}

function writeMigration(root: string, filename: string, sql: string): void {
  writeFileSync(join(root, "supabase/migrations", filename), sql);
}

test("findDefinerTenantProblems: reproduces the exact SEC-3 / audit-PR-#301 regression", () => {
  const root = makeFixtureRoot();
  try {
    writeMigration(
      root,
      "20260101000000_leaky_reader.sql",
      `
create or replace function public.resolve_account_tax_lines(p_org_id uuid)
returns table (x int)
  language sql stable security definer set search_path = public as $$
  select 1 from ledger_accounts where org_id = p_org_id;
$$;
grant execute on function public.resolve_account_tax_lines(uuid) to authenticated, service_role;
`,
    );

    const { problems, checked } = findDefinerTenantProblems(root);
    assert.equal(checked, 1);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /resolve_account_tax_lines/);
    assert.match(problems[0], /membership check/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("findDefinerTenantProblems: a can_access_org guard clears the finding", () => {
  const root = makeFixtureRoot();
  try {
    writeMigration(
      root,
      "20260101000000_guarded_reader.sql",
      `
create or replace function public.tax_m1_summary(p_org_id uuid)
returns table (x int)
  language sql stable security definer set search_path = public as $$
  select 1 from tax_adjustments where org_id = p_org_id and can_access_org(p_org_id);
$$;
grant execute on function public.tax_m1_summary(uuid) to authenticated, service_role;
`,
    );

    const { problems, checked } = findDefinerTenantProblems(root);
    assert.equal(checked, 1);
    assert.equal(problems.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("findDefinerTenantProblems: a service_role-only grant is not flagged (not end-user reachable)", () => {
  const root = makeFixtureRoot();
  try {
    writeMigration(
      root,
      "20260101000000_service_only.sql",
      `
create or replace function public.internal_reader(p_org_id uuid)
returns int
  language sql stable security definer set search_path = public as $$
  select 1 from ledger_accounts where org_id = p_org_id;
$$;
revoke all on function public.internal_reader(uuid) from public, anon, authenticated;
grant execute on function public.internal_reader(uuid) to service_role;
`,
    );

    const { problems, checked } = findDefinerTenantProblems(root);
    assert.equal(checked, 0);
    assert.equal(problems.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("findDefinerTenantProblems: a later revoke correctly overrides an earlier grant", () => {
  const root = makeFixtureRoot();
  try {
    writeMigration(
      root,
      "20260101000000_grant_then_lockdown.sql",
      `
create or replace function public.was_open(p_org_id uuid)
returns int
  language sql stable security definer set search_path = public as $$
  select 1 from ledger_accounts where org_id = p_org_id;
$$;
grant execute on function public.was_open(uuid) to authenticated, service_role;
revoke all on function public.was_open(uuid) from public, anon, authenticated;
grant execute on function public.was_open(uuid) to service_role;
`,
    );

    const { problems, checked } = findDefinerTenantProblems(root);
    assert.equal(checked, 0, "not currently reachable by authenticated — the revoke won");
    assert.equal(problems.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("findDefinerTenantProblems: a later migration's CREATE OR REPLACE wins over the original", () => {
  const root = makeFixtureRoot();
  try {
    writeMigration(
      root,
      "20260101000000_original.sql",
      `
create or replace function public.evolves(p_org_id uuid)
returns int
  language sql stable security definer set search_path = public as $$
  select 1 from ledger_accounts where org_id = p_org_id;
$$;
grant execute on function public.evolves(uuid) to authenticated, service_role;
`,
    );
    writeMigration(
      root,
      "20260102000000_fix.sql",
      `
create or replace function public.evolves(p_org_id uuid)
returns int
  language sql stable security definer set search_path = public as $$
  select 1 from ledger_accounts where org_id = p_org_id and can_access_org(p_org_id);
$$;
`,
    );

    const { problems, checked } = findDefinerTenantProblems(root);
    assert.equal(checked, 1);
    assert.equal(problems.length, 0, "the later, guarded body must win, not the original leaky one");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("findDefinerTenantProblems: an explicit `-- definer-ok:` marker opts out", () => {
  const root = makeFixtureRoot();
  try {
    writeMigration(
      root,
      "20260101000000_deliberate_admin_view.sql",
      `
create or replace function public.admin_cross_org_view(p_org_id uuid)
returns int
  language sql stable security definer set search_path = public as $$
  -- definer-ok: deliberate cross-tenant operator view, reviewed
  select 1 from ledger_accounts where org_id = p_org_id;
$$;
grant execute on function public.admin_cross_org_view(uuid) to authenticated;
`,
    );

    const { problems } = findDefinerTenantProblems(root);
    assert.equal(problems.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("findDefinerTenantProblems: a non-definer function is never flagged even if ungated", () => {
  const root = makeFixtureRoot();
  try {
    writeMigration(
      root,
      "20260101000000_invoker.sql",
      `
create or replace function public.invoker_reader(p_org_id uuid)
returns int
  language sql stable as $$
  select 1 from ledger_accounts where org_id = p_org_id;
$$;
grant execute on function public.invoker_reader(uuid) to authenticated;
`,
    );

    const { problems } = findDefinerTenantProblems(root);
    assert.equal(problems.length, 0, "SECURITY INVOKER runs as the CALLER — RLS already applies");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("findDefinerTenantProblems: a definer function with no org-scoping parameter is not flagged (disclosed gap)", () => {
  const root = makeFixtureRoot();
  try {
    writeMigration(
      root,
      "20260101000000_asset_keyed.sql",
      `
create or replace function public.asset_keyed_reader(p_asset_id uuid)
returns int
  language sql stable security definer set search_path = public as $$
  select 1 from fixed_assets where id = p_asset_id;
$$;
grant execute on function public.asset_keyed_reader(uuid) to authenticated;
`,
    );

    const { problems } = findDefinerTenantProblems(root);
    assert.equal(problems.length, 0, "no p_org-shaped param to key on — a documented narrower gap, not a false negative bug");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("findDefinerTenantProblems: recognizes the has_membership / is_admin_editor guard family", () => {
  const root = makeFixtureRoot();
  try {
    writeMigration(
      root,
      "20260101000000_membership_guarded.sql",
      `
create or replace function public.thread_history(p_org uuid)
returns int
  language sql stable security definer set search_path = public as $$
  select 1 from penny_thread_messages where org_id = p_org and has_membership(p_org);
$$;
grant execute on function public.thread_history(uuid) to authenticated;

create or replace function public.editor_action(p_org uuid)
returns int
  language plpgsql security definer set search_path = public as $$
begin
  if not is_admin_editor() then raise exception 'forbidden'; end if;
  return 1;
end$$;
grant execute on function public.editor_action(uuid) to authenticated;
`,
    );

    const { problems, checked } = findDefinerTenantProblems(root);
    assert.equal(checked, 2);
    assert.equal(problems.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("findDefinerTenantProblems: the real repo currently passes (regression gate)", () => {
  // Points at the actual repo root (two levels up from scripts/tests/) so this
  // test fails the moment a real migration regresses, same as the CLI check.
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(__dirname, "..", "..");
  const { problems } = findDefinerTenantProblems(repoRoot);
  assert.deepEqual(problems, []);
});
