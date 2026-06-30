# [ORGTEST] fixture manifest — Onboarding & org creation stress test

Prod ref `ejqsfzggyfsjzrcevlnq`. All data namespaced `[ORGTEST]`. **DELETE NOTHING** —
`cleanup.sql` is provided un-run for the integrator.

## Owner user
- `orgtest-owner@orgtest.founderfirst.test` → `4e272f7c-904e-4167-a5be-d601cae1a044`

## Orgs created (15 — via the live `orgs` edge fn during black-box testing)
| id | type | name | from test |
|---|---|---|---|
| 830a64d1-eaab-4337-94af-b18bd472e36b | business | `[object Object]` | T6 non-string name (BUG) |
| 5bed2410-798a-4251-a7fb-5d622b9e644e | business | `1,2,3` | T7 array name (BUG) |
| 99ca5ae1-2820-4b58-a346-152127090df6 | business | `12345` | T8 number name (BUG) |
| ae489e13-4864-4f1b-a74d-6b768e4eab47 | business | `[ORGTEST] AcmeBiz` | T10 forged-body (PASS) |
| 9803aea0-7dc0-412a-bd79-07b773876dc0 | firm | `[ORGTEST] AcmeCPA` | T11 firm role (PASS) |
| f7800e56-17d2-436a-97c9-08e65d48d9d5 | business | `[ORGTEST] DoubleSubmit` | T12 double-submit dup (BUG) |
| 932966e3-fea4-4c3e-ac45-3944cb581875 | business | `[ORGTEST] DoubleSubmit` | T12 double-submit dup (BUG) |
| 949f1ea7-a729-4a12-b27d-c5f952716fbc | business | `[ORGTEST] Bulk1` | T13 no cap |
| 167e96bd-f8f4-4d46-af02-54280ce04c4d | business | `[ORGTEST] Bulk2` | T13 |
| cb3ca8a9-5b17-4b71-b3a2-769aff77b72d | business | `[ORGTEST] Bulk3` | T13 |
| f09d3f2e-9a6a-4471-a736-9cd93adc0ff2 | business | `[ORGTEST] Bulk4` | T13 |
| 918f2a6a-202a-474b-9d85-659df670bccd | business | `[ORGTEST] Bulk5` | T13 |
| 803a91ae-6011-4845-b487-b0ebbbb8a38b | business | `[ORGTEST] Bulk6` | T13 |
| 69366f2a-530f-4809-8ada-47a41cba197a | business | `[ORGTEST] Bulk7` | T13 |
| 372a5729-3828-41e5-bc39-8711aac2fefb | business | `[ORGTEST] Bulk8` | T13 |

Each business org also has: 1 membership (owner), 1 subscription (pilot_free), 1
org_accounting_settings row (trigger). The firm has membership (firm_admin) +
subscription, NO settings (by design).

## Before/after prod row-count diff
| table | before | after | Δ |
|---|---|---|---|
| organizations | 88 | 103 | +15 |
| memberships | 94 | 109 | +15 |
| subscriptions | 88 | 103 | +15 |
| org_accounting_settings | 68 | 82 | +14 (14 business; firm has none) |

Δ is internally consistent (every business fully provisioned; firm has no settings row)
— happy-path creation is atomic in practice; the gaps are in the FAILURE paths + input
validation (see findings).
