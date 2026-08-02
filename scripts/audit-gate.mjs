#!/usr/bin/env node
//
// audit-gate: dependency advisory gate for CI.
//
// docs/AUDIT.md §1 requires "`pnpm audit` shows no high/critical". Until this
// script existed, nothing enforced that line. This is the enforcement.
//
// It audits three dependency trees, because the repo has three:
//   1. the pnpm workspace     (pnpm-lock.yaml)     apps/*, packages/*
//   2. site-bubble            (npm, own lockfile)  Cloudflare Worker
//   3. scripts/discord-bridge (npm, own lockfile)  Fly.io bridge
//
// Rules, in the order they are checked:
//
//   R1  Every allowlist entry must be well formed: id, package, tree, severity,
//       reason, reachability, owner, expires. A missing field fails.
//   R2  An allowlist entry whose `expires` is in the past FAILS THE BUILD,
//       whether or not the advisory is still present. This is the whole point.
//       An expiry that only prints a warning is decoration; a team stops
//       reading warnings within a week. Renewing an entry is a deliberate,
//       reviewable commit that restates the reachability argument.
//   R3  An allowlist entry may not be granted for longer than MAX_HORIZON_DAYS.
//       Without this you get `"expires": "2099-01-01"` and R2 never fires.
//   R4  Any high or critical advisory with no live allowlist entry fails.
//   R5  Allowlist entries that match nothing in the current audit are reported
//       as stale so they get deleted. This is a warning, not a failure: the
//       event that makes an entry stale is usually the vulnerability being
//       fixed, and turning good news into a red build teaches people to
//       allowlist more, not less. R2 still eventually forces the cleanup.
//
// Usage:
//   node scripts/audit-gate.mjs            # gate on high + critical
//   node scripts/audit-gate.mjs --level=moderate
//   node scripts/audit-gate.mjs --json     # machine-readable summary
//
// Exit 0 = clean or fully allowlisted. Exit 1 = gate failed. Exit 2 = the gate
// itself could not run (audit command missing, unparseable output, malformed
// allowlist JSON). A gate that cannot run must never look like a pass.
//
// The pure logic is exported and covered by scripts/tests/audit-gate.test.ts
// (`pnpm test:guards`), including proof that an expired entry fails.

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ALLOWLIST_PATH = join(ROOT, ".github", "audit-allowlist.json");

// Longest an allowlist entry may run before it must be re-argued. One quarter,
// chosen so every entry is revisited at least once per planning cycle rather
// than surviving a personnel change.
export const MAX_HORIZON_DAYS = 92;

export const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

export const REQUIRED_FIELDS = [
  "id",
  "package",
  "tree",
  "severity",
  "reason",
  "reachability",
  "owner",
  "expires",
];

/** The three dependency trees. `cmd` is run with cwd = dir. */
export const TREES = [
  {
    name: "pnpm-workspace",
    rel: ".",
    cmd: ["pnpm", ["audit", "--json"]],
    parse: parsePnpmAudit,
    ships: "apps/web (static marketing site), apps/app + apps/admin (SPA bundles)",
  },
  {
    name: "site-bubble",
    rel: "site-bubble",
    cmd: ["npm", ["audit", "--json", "--package-lock-only"]],
    parse: parseNpmAudit,
    ships: "Cloudflare Worker (Penny site bubble + Discord brain)",
  },
  {
    name: "discord-bridge",
    rel: "scripts/discord-bridge",
    cmd: ["npm", ["audit", "--json", "--package-lock-only"]],
    parse: parseNpmAudit,
    ships: "Fly.io Discord gateway relay",
  },
];

// ── parsers ──────────────────────────────────────────────────────────────────

/** pnpm audit --json emits the npm v1 shape: { advisories: { id: {...} } }. */
export function parsePnpmAudit(raw) {
  const d = JSON.parse(raw);
  return Object.values(d.advisories ?? {}).map((adv) => ({
    id: adv.github_advisory_id || `NPM-${adv.id}`,
    pkg: adv.module_name,
    severity: adv.severity,
    title: adv.title,
    vulnerable: adv.vulnerable_versions,
    patched: adv.patched_versions,
    paths: (adv.findings ?? []).flatMap((f) => f.paths ?? []).slice(0, 4),
  }));
}

/** npm audit --json emits the v2 shape: { vulnerabilities: { name: {...} } }. */
export function parseNpmAudit(raw) {
  const d = JSON.parse(raw);
  const seen = new Map();
  for (const [name, v] of Object.entries(d.vulnerabilities ?? {})) {
    for (const via of v.via ?? []) {
      if (typeof via === "string") continue; // transitive pointer, not an advisory
      const id = (via.url ?? "").split("/").pop() || `NPM-${via.source}`;
      if (seen.has(id)) continue;
      seen.set(id, {
        id,
        pkg: via.name ?? name,
        severity: via.severity,
        title: via.title,
        vulnerable: via.range,
        patched: v.fixAvailable?.version ? `>=${v.fixAvailable.version}` : "none",
        paths: (v.nodes ?? []).slice(0, 4),
      });
    }
  }
  return [...seen.values()];
}

// ── allowlist validation (R1, R2, R3) ────────────────────────────────────────

const DAY_MS = 86_400_000;
const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");
const midnightUtc = (d) => new Date(d.toISOString().slice(0, 10) + "T00:00:00Z");

/**
 * @param entries allowlist entries
 * @param today   Date, midnight UTC, injected so the tests are not time-bombs
 * @returns { structural, expired, overlong, liveKeys }
 */
export function validateAllowlist(entries, today) {
  const structural = [];
  const expired = [];
  const overlong = [];
  const liveKeys = new Set();

  entries.forEach((e, i) => {
    const where = `entries[${i}]${e.id ? ` (${e.id})` : ""}`;
    for (const f of REQUIRED_FIELDS) {
      if (e[f] === undefined || e[f] === null || String(e[f]).trim() === "") {
        structural.push(`${where}: missing "${f}"`);
      }
    }
    if (e.reason && String(e.reason).trim().length < 30) {
      structural.push(`${where}: "reason" must be a real argument, not a placeholder`);
    }
    if (e.reachability && String(e.reachability).trim().length < 30) {
      structural.push(`${where}: "reachability" must be a real argument, not a placeholder`);
    }
    if (e.expires === undefined || e.expires === null) return;
    if (!isIsoDate(e.expires)) {
      structural.push(`${where}: "expires" must be YYYY-MM-DD, got "${e.expires}"`);
      return;
    }
    const exp = new Date(e.expires + "T00:00:00Z");
    if (Number.isNaN(exp.getTime())) {
      structural.push(`${where}: "expires" is not a real date`);
      return;
    }
    const days = Math.round((exp - today) / DAY_MS);
    if (days < 0) {
      expired.push({ ...e, daysAgo: -days });
    } else if (days > MAX_HORIZON_DAYS) {
      overlong.push({ ...e, days });
    } else {
      liveKeys.add(`${e.tree}::${e.id}`);
    }
  });

  return { structural, expired, overlong, liveKeys };
}

// ── evaluation (R4, R5) ──────────────────────────────────────────────────────

/**
 * @param treeAdvisories { [treeName]: advisory[] }
 * @param entries        allowlist entries
 * @param minLevel       lowest severity that gates
 * @param today          Date, midnight UTC
 */
export function evaluate(treeAdvisories, entries, minLevel, today) {
  const { structural, expired, overlong, liveKeys } = validateAllowlist(entries, today);
  const gated = [];
  const suppressed = [];
  const matched = new Set();
  const perTree = {};

  for (const [treeName, advisories] of Object.entries(treeAdvisories)) {
    const tree = TREES.find((t) => t.name === treeName);
    perTree[treeName] = { total: advisories.length, gated: 0, suppressed: 0 };
    for (const a of advisories) {
      if (RANK[a.severity] < RANK[minLevel]) continue;
      const key = `${treeName}::${a.id}`;
      if (liveKeys.has(key)) {
        matched.add(key);
        suppressed.push({ ...a, tree: treeName });
        perTree[treeName].suppressed++;
      } else {
        gated.push({ ...a, tree: treeName, ships: tree?.ships ?? "unknown" });
        perTree[treeName].gated++;
      }
    }
  }

  // Stale = live entry that matched nothing. Expired entries are reported under
  // R2 instead, so they are not double-counted here.
  const stale = entries.filter(
    (e) => liveKeys.has(`${e.tree}::${e.id}`) && !matched.has(`${e.tree}::${e.id}`),
  );

  const failed =
    structural.length > 0 || expired.length > 0 || overlong.length > 0 || gated.length > 0;

  return { failed, perTree, gated, suppressed, expired, overlong, structural, stale };
}

// ── I/O ──────────────────────────────────────────────────────────────────────

function die(code, msg) {
  process.stderr.write(`audit-gate: ${msg}\n`);
  process.exit(code);
}

export function loadAllowlist(path = ALLOWLIST_PATH) {
  if (!existsSync(path)) return [];
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    die(2, `${path} is not valid JSON (${err.message})`);
  }
  const entries = parsed.entries ?? [];
  if (!Array.isArray(entries)) die(2, `${path}: "entries" must be an array`);
  return entries;
}

function runAudit(tree) {
  const dir = join(ROOT, tree.rel);
  if (!existsSync(dir)) return null;
  let raw;
  try {
    // Both commands exit non-zero when they find anything, so stdout is the
    // signal and a throw still carries the payload.
    raw = execFileSync(tree.cmd[0], tree.cmd[1], {
      cwd: dir,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (err) {
    raw = err.stdout;
    if (!raw) die(2, `${tree.name}: \`${tree.cmd[0]} audit\` produced no output (${err.message})`);
  }
  try {
    return tree.parse(raw);
  } catch (err) {
    die(2, `${tree.name}: could not parse audit JSON (${err.message})`);
  }
}

function main(argv) {
  const asJson = argv.includes("--json");
  const levelArg = argv.find((a) => a.startsWith("--level="));
  const minLevel = levelArg ? levelArg.split("=")[1] : "high";
  if (!(minLevel in RANK)) die(2, `unknown --level=${minLevel}`);

  const treeAdvisories = {};
  const skipped = [];
  for (const tree of TREES) {
    const advisories = runAudit(tree);
    if (advisories === null) skipped.push(tree.name);
    else treeAdvisories[tree.name] = advisories;
  }

  const today = midnightUtc(new Date());
  const r = evaluate(treeAdvisories, loadAllowlist(), minLevel, today);

  if (asJson) {
    process.stdout.write(JSON.stringify({ level: minLevel, skipped, ...r }, null, 2) + "\n");
    process.exit(r.failed ? 1 : 0);
  }

  const log = (s = "") => process.stdout.write(s + "\n");
  log(`audit-gate: failing on ${minLevel} and above`);
  log();
  for (const [name, s] of Object.entries(r.perTree)) {
    log(`  ${name.padEnd(16)} ${s.total} advisories, ${s.gated} gated, ${s.suppressed} allowlisted`);
  }
  for (const name of skipped) log(`  ${name.padEnd(16)} skipped (directory missing)`);
  log();

  if (r.structural.length) {
    log("MALFORMED ALLOWLIST ENTRIES (R1)");
    for (const m of r.structural) log(`  - ${m}`);
    log();
  }

  if (r.expired.length) {
    log("EXPIRED ALLOWLIST ENTRIES (R2), these fail the build by design");
    for (const e of r.expired) {
      log(`  - ${e.id} (${e.package}, ${e.tree}) expired ${e.expires}, ${e.daysAgo} day(s) ago. Owner: ${e.owner}`);
      log("    Renew it with a restated reachability argument, or fix the advisory.");
      log("    Do not extend it silently.");
    }
    log();
  }

  if (r.overlong.length) {
    log(`OVER-LONG ALLOWLIST ENTRIES (R3), max ${MAX_HORIZON_DAYS} days`);
    for (const e of r.overlong) log(`  - ${e.id} expires ${e.expires}, ${e.days} days out`);
    log();
  }

  if (r.gated.length) {
    log("UNALLOWLISTED ADVISORIES (R4)");
    for (const a of r.gated) {
      log(`  - [${a.severity}] ${a.pkg} ${a.vulnerable} -> ${a.patched}  ${a.id}`);
      log(`    ${a.title}`);
      log(`    tree: ${a.tree} (ships: ${a.ships})`);
      if (a.paths?.length) log(`    via: ${a.paths.join(", ")}`);
    }
    log();
    log("  Fix it, or add an entry to .github/audit-allowlist.json with a reachability");
    log("  argument, an owner, and an expiry. Every field is required.");
    log();
  }

  if (r.suppressed.length) {
    log("ALLOWLISTED (still open, still tracked)");
    const entries = loadAllowlist();
    for (const a of r.suppressed) {
      const e = entries.find((x) => x.tree === a.tree && x.id === a.id);
      log(`  - [${a.severity}] ${a.pkg} ${a.id} until ${e.expires} (${e.owner})`);
    }
    log();
  }

  if (r.stale.length) {
    log("STALE ALLOWLIST ENTRIES (R5, warning), matched no current advisory, delete them");
    for (const e of r.stale) log(`  - ${e.id} (${e.package}, ${e.tree})`);
    log();
  }

  log(r.failed ? "FAIL" : "PASS");
  process.exit(r.failed ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
