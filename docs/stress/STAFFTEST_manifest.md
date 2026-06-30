# [stress:staff] fixture manifest

All test identities namespaced `@stafftest.founderfirst.test`.

## Durable fixtures left on prod (removed by `STAFFTEST_cleanup.sql`)

| Table | Row | Notes |
|-------|-----|-------|
| `auth.users` | `tenant1@stafftest.founderfirst.test` (`826a9f69-99dc-4156-a8bd-b6732bc9b50a`) | Plain authenticated tenant user. NOT an admin, NOT platform staff. Used to drive non-staff/non-admin runtime gate probes from a real JWT. |

## Ephemeral fixtures (rolled back — left NOTHING)

Ran inside transactions terminated by `RAISE` to force `ROLLBACK`:

- `admins`: `viewer@…`, `editor@…`, `super@…`, `bgstaff@…` (tier + break-glass gate sims)
- `auth.users`: `bgstaff@…` (break-glass lifecycle sim)
- `break_glass_grants`: grants opened during the lifecycle sim
- `admin_audit`: `break_glass.open/.close` rows written during the sim

## Prod row-count diff (before → after)

| Table | Before | After | Δ |
|-------|--------|-------|---|
| `admins` | 10 | 10 | 0 |
| `break_glass_grants` | 4 | 4 | 0 |
| `auth.users` (@stafftest) | 0 | 1 | +1 |
| `admin_audit` (@stafftest / STAFFTEST) | 0 | 0 | 0 |
