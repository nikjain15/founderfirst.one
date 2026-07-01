# [stress:auth] AUTHTEST — fixture manifest

Prod ref `ejqsfzggyfsjzrcevlnq`. All fixtures namespaced `@authtest.founderfirst.test` /
`[AUTHTEST]`. **Nothing deleted** during testing. Cleanup is un-run (`cleanup.sql`).

## Auth users minted (6)
| email | user id | purpose |
|---|---|---|
| owner-a@authtest.founderfirst.test | 5ee9c1c1-94d3-45c8-889b-f91d973bf94e | tenant A (real JWT, owns Org A) |
| owner-b@authtest.founderfirst.test | ad192e4e-ff38-4ea7-86ef-fced9ec10e64 | tenant B (real JWT, owns Org B) — cross-tenant target |
| reuse@authtest.founderfirst.test | 36b99c01-9316-4342-bc90-3f8b87acbcd8 | one-time-link replay test |
| bind1@authtest.founderfirst.test | ba87d61c-c945-452b-b035-3f3e2f18d5a6 | email-binding test |
| ratelimit@authtest.founderfirst.test | 2b01e6e6-fa27-4349-a4a1-8c25ee1fe198 | OTP rate-limit probe |
| redir@authtest.founderfirst.test | 8f527e75-85d9-445a-a8d9-a3d13ba3339d | open-redirect probe |

## Orgs created (2, via `orgs` edge fn write-path)
| name | id | owner |
|---|---|---|
| [AUTHTEST] Org A | eabd71e6-9ad9-46c4-92fb-bc375368bfb3 | owner-a |
| [AUTHTEST] Org B | 47398cc6-d37f-4da3-8b16-37be33be640c | owner-b |

Each org auto-created one `memberships` row (owner). No ledger entries, engagements,
invites, or imports were created.

## Row-count diff (my contribution)
| table | my delta |
|---|---|
| auth.users | +6 |
| organizations | +2 |
| memberships | +2 (owner rows) |
| engagements | 0 |

> NOTE: absolute global counts moved much more than this during the window
> (organizations 56→85, engagements 17→24) because **other parallel stress
> sessions were creating fixtures concurrently**. Those rows are not mine and are
> off-limits. The deltas above are exactly the rows `cleanup.sql` removes.

## How fixtures were minted
`admin/generate_link` (magiclink, service role) → read `email_otp` → `POST /auth/v1/verify`
(anon apikey) → real ES256 JWT. Orgs via `POST /functions/v1/orgs` under each user's JWT.
No schema/migration/edge-fn/config change was made (pure black-box).
