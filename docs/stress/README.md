# Stress-test artifacts — index

Campaign artifacts from the feature stress-test program. The status board +
operating rules live in [../STRESS_TEST_TRACKER.md](../STRESS_TEST_TRACKER.md);
this folder holds the durable evidence: findings, repro harnesses, and fixture
**cleanup scripts** (⚠️ some `cleanup.sql` files may be un-run — check the tracker
before reusing prod fixtures).

| Campaign | Findings | Cleanup | Extras |
|---|---|---|---|
| Invites `[INVTEST]` | [INVTEST_findings.md](INVTEST_findings.md) | [INVTEST_cleanup.sql](INVTEST_cleanup.sql) | |
| Auth `[AUTHTEST]` | [auth/FINDINGS.md](auth/FINDINGS.md) | [auth/cleanup.sql](auth/cleanup.sql) | [auth/MANIFEST.md](auth/MANIFEST.md) (fixtures) |
| Categorize `[CATTEST]` | [categorize/FINDINGS.md](categorize/FINDINGS.md) | — | `categorize/repro/` harness |
| Reports | [reports-2026jun30/manifest.md](reports-2026jun30/manifest.md) | [reports-2026jun30/cleanup.sql](reports-2026jun30/cleanup.sql) | |

New campaign = new `docs/stress/<feature>[-<yyyymmmdd>]/` dir with a dated
FINDINGS.md + a row here and in the tracker (see [docs/README.md](../README.md) §2.8).
