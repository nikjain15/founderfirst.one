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
  parseRequirements,
  compareRelease,
  isPlainRelease,
  resolveCeiling,
  normalizeOsvVulns,
  queryOsvOne,
  isPythonTree,
  TREES,
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

/**
 * The bug this covers was live and it gave instructions.
 *
 * CI runs the gate at --level=high. The three torch entries covering tts-server
 * are moderate, so the advisories they cover were skipped before staleness was
 * ever computed, so every run printed "STALE ALLOWLIST ENTRIES (R5), matched no
 * current advisory, delete them" about three entries that were live, correct,
 * and pointing at advisories still present in the scan.
 *
 * Deleting them, as instructed, would have destroyed three dated, owned,
 * falsifiable reachability arguments. Staleness is a question about the audit,
 * not about the gating threshold.
 */
test("R5: an entry below the gating threshold is NOT stale, because its advisory is still there", () => {
  const entry = goodEntry({ severity: "moderate" });
  const stillPresent = advisory({ severity: "moderate" });
  const r = evaluate({ "pnpm-workspace": [stillPresent] }, [entry], "high", TODAY);

  assert.equal(r.gated.length, 0, "moderate must not gate at --level=high");
  assert.equal(r.suppressed.length, 0, "and it is not suppressed either, it was never considered");
  assert.equal(r.stale.length, 0, "but it is NOT stale: the advisory is still in the scan");
});

test("R5: an entry pointing at an UNRANKED advisory is not stale either", () => {
  // OSV returns no severity for many torch CVEs. Those are held out of ranking
  // entirely, so they are absent from treeAdvisories. An allowlist entry
  // covering one is still live work, not a leftover.
  const entry = goodEntry({ id: "CVE-2025-46148", package: "torch", tree: "tts-server" });
  const r = evaluate({ "tts-server": [] }, [entry], "high", TODAY, [
    { id: "CVE-2025-46148", pkg: "torch", tree: "tts-server", severity: "unknown" },
  ]);

  assert.equal(r.stale.length, 0);
});

test("R5: an entry whose advisory really is gone is still reported stale", () => {
  // The rule must keep working, or the fix above just disables it.
  const r = evaluate({ "pnpm-workspace": [] }, [goodEntry({ severity: "moderate" })], "high", TODAY);
  assert.equal(r.stale.length, 1);
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

// ── Python trees (OSV) ───────────────────────────────────────────────────────
//
// These cover the gap that made the Python services invisible: the gate audited
// three npm trees and had no notion of requirements.txt, while kokoro-server is
// the default engine behind the content-audio edge function.

test("both Python services are declared as trees, and are recognised as Python", () => {
  const py = TREES.filter(isPythonTree).map((t) => t.name);
  assert.deepEqual(py.sort(), ["kokoro-server", "tts-server"]);
  for (const t of TREES.filter(isPythonTree)) {
    assert.equal(t.manifest, "requirements.txt");
    assert.ok(t.ships && t.ships.length > 10, `${t.name} must say what it ships`);
  }
});

test("parseRequirements reads pinned packages, strips extras and markers", () => {
  const { pinned } = parseRequirements(
    [
      "fastapi==0.115.5",
      "uvicorn[standard]==0.32.1",
      "torch==2.6.0  # the live voice engine",
      "",
      "typing_extensions==4.10.0 ; python_version < '3.13'",
    ].join("\n"),
  );
  assert.deepEqual(pinned, [
    { name: "fastapi", version: "0.115.5" },
    { name: "uvicorn", version: "0.32.1" },
    { name: "torch", version: "2.6.0" },
    { name: "typing-extensions", version: "4.10.0" },
  ]);
});

test("parseRequirements reports what it cannot check instead of skipping it", () => {
  // The whole reason the Python trees were uncovered is that nothing said so.
  const { pinned, unpinned, ceilinged } = parseRequirements(
    ["setuptools<81", "kokoro", "-r base.txt", "torch==2.6.0"].join("\n"),
  );
  assert.deepEqual(pinned, [{ name: "torch", version: "2.6.0" }]);
  assert.deepEqual(unpinned.map((u) => u.raw).sort(), ["-r base.txt", "kokoro"]);

  // `setuptools<81` used to land in `unpinned` and print "OSV cannot be asked".
  // OSV could be asked. See resolveCeiling.
  assert.deepEqual(ceilinged, [
    { name: "setuptools", op: "<", bound: "81", raw: "setuptools<81" },
  ]);
});

test("compareRelease orders release segments numerically, not as strings", () => {
  assert.ok(compareRelease("80.10.2", "80.9.0") > 0, "80.10.2 is newer than 80.9.0");
  assert.ok(compareRelease("81", "80.10.2") > 0);
  assert.equal(compareRelease("80.9", "80.9.0"), 0);
});

test("isPlainRelease rejects pre-releases, which pip would not install by default", () => {
  assert.ok(isPlainRelease("80.10.2"));
  assert.ok(!isPlainRelease("81.0.0rc1"));
  assert.ok(!isPlainRelease("2.6.0+cu118"));
});

test("resolveCeiling picks the NEWEST release under the ceiling", async () => {
  // The point of picking the newest: if the most favourable version a
  // constraint permits is still vulnerable, then EVERY version it permits is,
  // which is a stronger claim than auditing an arbitrary one.
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({
      releases: { "80.9.0": [], "80.10.2": [], "81.0.0": [], "83.0.0": [], "81.0.0rc1": [] },
    }),
  });

  const best = await resolveCeiling({ name: "setuptools", op: "<", bound: "81" }, fakeFetch as never);
  assert.equal(best, "80.10.2");

  const inclusive = await resolveCeiling(
    { name: "setuptools", op: "<=", bound: "81.0.0" },
    fakeFetch as never,
  );
  assert.equal(inclusive, "81.0.0");
});

test("resolveCeiling returns null rather than a false clean when PyPI is unreachable", async () => {
  // A gate that cannot check something must never report it as checked.
  const failing = async () => ({ ok: false, json: async () => ({}) });
  assert.equal(
    await resolveCeiling({ name: "setuptools", op: "<", bound: "81" }, failing as never),
    null,
  );

  const empty = async () => ({ ok: true, json: async () => ({ releases: { "90.0.0": [] } }) });
  assert.equal(
    await resolveCeiling({ name: "setuptools", op: "<", bound: "81" }, empty as never),
    null,
  );
});

test("normalizeOsvVulns collapses a PYSEC alias into its GHSA and keeps the severity", () => {
  // OSV returns the same advisory twice; only the GHSA carries a severity, and
  // an id that changes between runs cannot be allowlisted stably.
  const out = normalizeOsvVulns(
    [
      {
        id: "GHSA-887c-mr87-cxwp",
        aliases: ["CVE-2025-0001", "PYSEC-2026-1970"],
        summary: "Improper resource shutdown",
        database_specific: { severity: "MODERATE" },
        affected: [{ ranges: [{ events: [{ introduced: "0" }, { fixed: "2.8.0" }] }] }],
      },
      { id: "PYSEC-2026-1970", aliases: ["GHSA-887c-mr87-cxwp"], affected: [] },
    ],
    "torch",
    "2.6.0",
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "GHSA-887c-mr87-cxwp");
  assert.equal(out[0].severity, "moderate");
  assert.equal(out[0].patched, ">=2.8.0");
});

test("normalizeOsvVulns marks an unrankable advisory unknown rather than inventing a rank", () => {
  const out = normalizeOsvVulns([{ id: "PYSEC-2026-139", affected: [] }], "torch", "2.6.0");
  assert.equal(out[0].severity, "unknown");
  assert.equal(out[0].patched, "none");
  // "unknown" is deliberately not a RANK key: it cannot be compared, so it can
  // never be silently ranked below the gating threshold and dropped.
  assert.equal(RANK.unknown, undefined);
});

test("normalizeOsvVulns reports no fix as none, not as a passing version", () => {
  const out = normalizeOsvVulns(
    [
      {
        id: "GHSA-x3gm-94wq-g975",
        summary: "no fix at any version",
        database_specific: { severity: "LOW" },
        affected: [{ ranges: [{ events: [{ introduced: "0" }] }] }],
      },
    ],
    "torch",
    "2.6.0",
  );
  assert.equal(out[0].patched, "none");
  assert.equal(out[0].severity, "low");
});

test("queryOsvOne asks OSV for the right package and fails loudly on a bad response", async () => {
  let sent;
  const ok = await queryOsvOne({ name: "torch", version: "2.6.0" }, async (url, init) => {
    sent = { url, body: JSON.parse(init.body) };
    return { ok: true, json: async () => ({ vulns: [] }) };
  });
  assert.deepEqual(ok, []);
  assert.equal(sent.url, "https://api.osv.dev/v1/query");
  assert.deepEqual(sent.body, { package: { name: "torch", ecosystem: "PyPI" }, version: "2.6.0" });

  // A gate that treats an OSV outage as "no advisories" would report a clean
  // bill of health for a service it never checked.
  await assert.rejects(
    () => queryOsvOne({ name: "torch", version: "2.6.0" }, async () => ({ ok: false, status: 503 })),
    /HTTP 503/,
  );
});

test("a Python advisory gates and can be allowlisted by tree, like any other", () => {
  const today = new Date("2026-08-02T00:00:00Z");
  const advisories = {
    "kokoro-server": [
      { id: "GHSA-887c-mr87-cxwp", pkg: "torch", severity: "moderate", title: "t", vulnerable: "==2.6.0", patched: ">=2.8.0" },
    ],
  };
  const bare = evaluate(advisories, [], "moderate", today);
  assert.equal(bare.failed, true);

  const entry = {
    id: "GHSA-887c-mr87-cxwp",
    package: "torch",
    tree: "kokoro-server",
    severity: "moderate",
    reason: "fix needs a verified Fly deploy of the live voice engine, scheduled",
    reachability: "input is a text script over a shared-secret endpoint, not attacker-supplied tensors",
    owner: "Nik Jain",
    expires: "2026-09-15",
  };
  const allowed = evaluate(advisories, [entry], "moderate", today);
  assert.equal(allowed.failed, false);
  assert.equal(allowed.suppressed.length, 1);

  // Same id on a different tree must NOT be suppressed by this entry.
  const other = evaluate(
    { "tts-server": advisories["kokoro-server"] },
    [entry],
    "moderate",
    today,
  );
  assert.equal(other.failed, true);
});
