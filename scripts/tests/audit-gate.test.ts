/**
 * Unit tests for scripts/audit-gate.mjs, the dependency advisory gate (S-1).
 *
 * The point of these tests is rule R2. The prior art this gate was modelled on
 * had allowlist entries that expired silently, so the allowlist quietly became
 * permanent. The test named "an expired entry fails the build" is the one that
 * has to keep passing forever; everything else is supporting cast.
 *
 * `today` is injected into every call so these are not time-bombs.
 * Run: `pnpm test:guards`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluate,
  validateAllowlist,
  parsePnpmAudit,
  parseNpmAudit,
  MAX_HORIZON_DAYS,
  RANK,
} from "../audit-gate.mjs";

const TODAY = new Date("2026-08-02T00:00:00Z");
const day = (n: number) =>
  new Date(TODAY.getTime() + n * 86_400_000).toISOString().slice(0, 10);

const goodEntry = (over: Record<string, unknown> = {}) => ({
  id: "GHSA-test-0000-0000",
  package: "leftpad",
  tree: "pnpm-workspace",
  severity: "high",
  reason: "The fix is a major version bump that rewrites the ledger import path.",
  reachability: "Not reachable: the vulnerable API is only called by the dev server.",
  owner: "Nik Jain",
  expires: day(30),
  ...over,
});

const advisory = (over: Record<string, unknown> = {}) => ({
  id: "GHSA-test-0000-0000",
  pkg: "leftpad",
  severity: "high",
  title: "leftpad pads left too enthusiastically",
  vulnerable: "<1.0.0",
  patched: ">=1.0.0",
  paths: ["apps/web > leftpad@0.9.0"],
  ...over,
});

// ── R2: expiry is enforced, not decorative ───────────────────────────────────

test("R2: an expired entry fails the build even when the advisory is gone", () => {
  const r = evaluate({ "pnpm-workspace": [] }, [goodEntry({ expires: day(-1) })], "high", TODAY);
  assert.equal(r.failed, true, "one-day-expired entry must fail");
  assert.equal(r.expired.length, 1);
  assert.equal(r.expired[0].daysAgo, 1);
  assert.equal(r.gated.length, 0, "the advisory itself is gone, so nothing is gated");
});

test("R2: an expired entry no longer suppresses its advisory", () => {
  const r = evaluate(
    { "pnpm-workspace": [advisory()] },
    [goodEntry({ expires: day(-1) })],
    "high",
    TODAY,
  );
  assert.equal(r.failed, true);
  assert.equal(r.suppressed.length, 0);
  assert.equal(r.gated.length, 1, "an expired entry must stop suppressing");
});

test("R2: an entry expiring today is still live", () => {
  const r = evaluate({ "pnpm-workspace": [advisory()] }, [goodEntry({ expires: day(0) })], "high", TODAY);
  assert.equal(r.failed, false);
  assert.equal(r.suppressed.length, 1);
});

// ── R3: the horizon cap is what makes R2 unavoidable ─────────────────────────

test("R3: an expiry beyond the horizon fails, so R2 cannot be dodged", () => {
  const r = evaluate({ "pnpm-workspace": [] }, [goodEntry({ expires: "2099-01-01" })], "high", TODAY);
  assert.equal(r.failed, true);
  assert.equal(r.overlong.length, 1);
});

test("R3: exactly MAX_HORIZON_DAYS out is allowed, one day more is not", () => {
  const ok = evaluate({ "pnpm-workspace": [] }, [goodEntry({ expires: day(MAX_HORIZON_DAYS) })], "high", TODAY);
  assert.equal(ok.overlong.length, 0);
  const bad = evaluate({ "pnpm-workspace": [] }, [goodEntry({ expires: day(MAX_HORIZON_DAYS + 1) })], "high", TODAY);
  assert.equal(bad.overlong.length, 1);
  assert.equal(bad.failed, true);
});

test("R3: an over-long entry does not suppress its advisory either", () => {
  const r = evaluate(
    { "pnpm-workspace": [advisory()] },
    [goodEntry({ expires: "2099-01-01" })],
    "high",
    TODAY,
  );
  assert.equal(r.gated.length, 1);
});

// ── R1: every field is required and must say something ───────────────────────

for (const field of ["id", "package", "tree", "severity", "reason", "reachability", "owner", "expires"]) {
  test(`R1: a missing "${field}" fails`, () => {
    const e = goodEntry();
    delete (e as Record<string, unknown>)[field];
    const r = evaluate({ "pnpm-workspace": [] }, [e], "high", TODAY);
    assert.equal(r.failed, true);
    assert.ok(
      r.structural.some((m: string) => m.includes(`missing "${field}"`)),
      `expected a structural error naming ${field}, got ${JSON.stringify(r.structural)}`,
    );
  });
}

test("R1: a placeholder reason is rejected", () => {
  const r = evaluate({ "pnpm-workspace": [] }, [goodEntry({ reason: "later" })], "high", TODAY);
  assert.equal(r.failed, true);
  assert.ok(r.structural.some((m: string) => m.includes("real argument")));
});

test("R1: a placeholder reachability is rejected", () => {
  const r = evaluate({ "pnpm-workspace": [] }, [goodEntry({ reachability: "n/a" })], "high", TODAY);
  assert.equal(r.failed, true);
});

test("R1: a non-ISO expiry is rejected", () => {
  const r = evaluate({ "pnpm-workspace": [] }, [goodEntry({ expires: "31 Oct 2026" })], "high", TODAY);
  assert.equal(r.failed, true);
  assert.ok(r.structural.some((m: string) => m.includes("YYYY-MM-DD")));
});

// ── R4: unallowlisted high/critical fails ────────────────────────────────────

test("R4: an unallowlisted high fails", () => {
  const r = evaluate({ "pnpm-workspace": [advisory()] }, [], "high", TODAY);
  assert.equal(r.failed, true);
  assert.equal(r.gated.length, 1);
  assert.equal(r.gated[0].ships.includes("apps/web"), true, "the gate reports what the tree ships");
});

test("R4: an unallowlisted critical fails", () => {
  const r = evaluate({ "pnpm-workspace": [advisory({ severity: "critical" })] }, [], "high", TODAY);
  assert.equal(r.failed, true);
});

test("R4: moderate and low do not gate at the default level", () => {
  const r = evaluate(
    { "pnpm-workspace": [advisory({ severity: "moderate" }), advisory({ id: "x", severity: "low" })] },
    [],
    "high",
    TODAY,
  );
  assert.equal(r.failed, false);
  assert.equal(r.gated.length, 0);
});

test("R4: --level=moderate widens the gate", () => {
  const r = evaluate({ "pnpm-workspace": [advisory({ severity: "moderate" })] }, [], "moderate", TODAY);
  assert.equal(r.failed, true);
});

test("R4: an entry is scoped to one tree, not shared across all three", () => {
  const r = evaluate(
    { "pnpm-workspace": [advisory()], "site-bubble": [advisory()] },
    [goodEntry({ tree: "pnpm-workspace" })],
    "high",
    TODAY,
  );
  assert.equal(r.suppressed.length, 1);
  assert.equal(r.gated.length, 1);
  assert.equal(r.gated[0].tree, "site-bubble");
});

// ── R5: stale entries warn but do not fail ───────────────────────────────────

test("R5: a live entry matching nothing is stale, and stale alone does not fail", () => {
  const r = evaluate({ "pnpm-workspace": [] }, [goodEntry()], "high", TODAY);
  assert.equal(r.failed, false);
  assert.equal(r.stale.length, 1);
});

test("R5: an expired entry is reported as expired, not double-counted as stale", () => {
  const r = evaluate({ "pnpm-workspace": [] }, [goodEntry({ expires: day(-5) })], "high", TODAY);
  assert.equal(r.expired.length, 1);
  assert.equal(r.stale.length, 0);
});

// ── the clean case ───────────────────────────────────────────────────────────

test("a clean audit with an empty allowlist passes", () => {
  const r = evaluate({ "pnpm-workspace": [], "site-bubble": [], "discord-bridge": [] }, [], "high", TODAY);
  assert.equal(r.failed, false);
  assert.deepEqual(r.perTree["site-bubble"], { total: 0, gated: 0, suppressed: 0 });
});

// ── parsers ──────────────────────────────────────────────────────────────────

test("parsePnpmAudit: reads the npm v1 advisories shape pnpm emits", () => {
  const raw = JSON.stringify({
    advisories: {
      "1109850": {
        id: 1109850,
        github_advisory_id: "GHSA-wrwg-2hg8-v723",
        module_name: "astro",
        severity: "high",
        title: "Astro vulnerable to reflected XSS via the server islands feature",
        vulnerable_versions: "<=5.15.6",
        patched_versions: ">=5.15.8",
        findings: [{ version: "4.16.19", paths: ["apps/web > astro@4.16.19"] }],
      },
    },
  });
  const [a] = parsePnpmAudit(raw);
  assert.equal(a.id, "GHSA-wrwg-2hg8-v723");
  assert.equal(a.pkg, "astro");
  assert.equal(a.severity, "high");
  assert.deepEqual(a.paths, ["apps/web > astro@4.16.19"]);
});

test("parsePnpmAudit: falls back to the numeric id when there is no GHSA", () => {
  const raw = JSON.stringify({
    advisories: { "42": { id: 42, module_name: "x", severity: "high", findings: [] } },
  });
  assert.equal(parsePnpmAudit(raw)[0].id, "NPM-42");
});

test("parseNpmAudit: reads the v2 vulnerabilities shape and skips string `via`", () => {
  const raw = JSON.stringify({
    vulnerabilities: {
      esbuild: {
        name: "esbuild",
        severity: "moderate",
        via: [
          {
            source: 1102341,
            name: "esbuild",
            title: "esbuild dev server request forgery",
            url: "https://github.com/advisories/GHSA-67mh-4wv8-2f99",
            severity: "moderate",
            range: "<=0.24.2",
          },
        ],
        nodes: ["node_modules/esbuild"],
        fixAvailable: { name: "esbuild", version: "0.28.1", isSemVerMajor: true },
      },
      vite: { name: "vite", severity: "moderate", via: ["esbuild"], nodes: ["node_modules/vite"] },
    },
  });
  const out = parseNpmAudit(raw);
  assert.equal(out.length, 1, "a string `via` is a pointer to another package, not an advisory");
  assert.equal(out[0].id, "GHSA-67mh-4wv8-2f99");
  assert.equal(out[0].patched, ">=0.28.1");
});

test("parseNpmAudit: an advisory reachable through two packages is reported once", () => {
  const one = {
    source: 1,
    name: "ws",
    title: "ws DoS",
    url: "https://github.com/advisories/GHSA-dup",
    severity: "high",
    range: "<8.21.0",
  };
  const raw = JSON.stringify({
    vulnerabilities: {
      ws: { name: "ws", severity: "high", via: [one], nodes: ["node_modules/ws"] },
      other: { name: "other", severity: "high", via: [one], nodes: ["node_modules/other"] },
    },
  });
  assert.equal(parseNpmAudit(raw).length, 1);
});

// ── ordering invariant the gate depends on ───────────────────────────────────

test("severity ranking orders low < moderate < high < critical", () => {
  assert.ok(RANK.low < RANK.moderate);
  assert.ok(RANK.moderate < RANK.high);
  assert.ok(RANK.high < RANK.critical);
});

test("validateAllowlist reports an empty allowlist as entirely clean", () => {
  const v = validateAllowlist([], TODAY);
  assert.deepEqual(v.structural, []);
  assert.deepEqual(v.expired, []);
  assert.deepEqual(v.overlong, []);
  assert.equal(v.liveKeys.size, 0);
});
