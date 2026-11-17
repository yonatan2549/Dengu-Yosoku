# Alert Center database design

Status: Supabase Auth scaffold and PostgreSQL schema are prepared; project credentials and central Alert persistence are **not connected**.

## Why this stage is separate

The current Alert Center is browser-local. Supabase Auth sign-in and role-based
read policies are scaffolded, but the Supabase project has not yet been
configured and the server-side Alert event repository/API is not implemented.
Do not expose a service credential in client code or create a public write
endpoint. Alert tables have no browser-facing write policies.

## PostgreSQL schema

Apply migrations in order:

1. `database/migrations/001_alert_center.sql`
2. `database/migrations/002_alert_integrity_hardening.sql`

| Table | Purpose |
| --- | --- |
| `alert_rule_profiles` | Versioned methodology, approval reference, effective week and profile status |
| `alert_rule_thresholds` | One WATCH/ALERT threshold pair per province and profile |
| `alert_evaluation_runs` | Model provenance, target/current epi weeks, freshness, checks and blocked reasons |
| `alert_events` | Stable event key, province, target week, latest signal, status and source model |
| `alert_event_transitions` | Append-only record of acknowledgement, resolution, reopening and severity changes |

The schema enforces Sunday week starts, non-negative predictions/thresholds,
ALERT > WATCH, valid model SHA shape, status values, and the invariant that
external delivery remains disabled. The hardening migration prevents edits to
approved rule profiles and their thresholds, and prevents update/delete/truncate
of transition history. It does not infer an alert level from a predicted case
count. Complete 77-province threshold coverage and approval must also be checked
transactionally by the eventual server repository.

No patient records, symptom questionnaire answers, names, phone numbers, or
other patient identifiers belong in these tables.

## Server-side repository boundary

`lib/alerting/database-contract.ts` defines the interface for saving an
evaluation run, reconciling candidates, listing/filtering events, recording
reviewer transitions, and checking database readiness. It is an interface only;
there is no active adapter or API route in this stage.

The application uses `SUPABASE_URL` and `SUPABASE_ANON_KEY` in server-side
route handlers. These values must be configured in local and Vercel environments.
The anon key is not a privileged secret; the service-role key must never be
placed in browser code. This stage does not use a service-role key. The presence
of configuration does not establish that database policies or role permissions
are correct.

## Required decisions before connecting a live database

1. Create the Supabase project and configure its URL/anon key locally and in Vercel.
2. Apply all three migrations in a staging project and test anonymous, viewer,
   reviewer, and administrator access.
3. Create accounts through the Supabase Dashboard; the application has no public
   sign-up flow. New accounts default to `viewer`.
4. Promote the first trusted administrator through the Supabase SQL Editor using
   the documented bootstrap statement; then manage roles deliberately.
5. Define who may create/edit/approve Rule Profiles and who may acknowledge or
   resolve an event.
6. Implement a server-side repository using verified sessions and transactional
   RPCs. Never trust a client-supplied actor ID.
7. Add integration tests for rollback, idempotency, deduplication, permissions,
   and immutable transition history before enabling central Alert persistence.

## Current behavior

Until those decisions and tests are complete, the website keeps using the
existing browser-local event history. No new database connection is attempted,
no user-facing behavior is changed, and external notifications remain disabled.


## Supabase authentication rollout

The application now has a first-stage Supabase Auth integration using the
Supabase Auth and PostgREST HTTP endpoints from server-side Next.js route
handlers. Session tokens are stored in HttpOnly, SameSite=Lax cookies; the
browser never receives the access or refresh token. The anon key is used only
as the public Supabase API key. A service-role key is not used by this stage.

Apply migrations in this order:

1. `database/migrations/001_alert_center.sql`
2. `database/migrations/002_alert_integrity_hardening.sql`
3. `database/migrations/003_supabase_auth_and_rls.sql`

Configure `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the local environment
and Vercel project environment settings. Do not use a `NEXT_PUBLIC_` prefix
for these variables in this implementation, and never add a service-role key
to client-side code.

Create/invite accounts from the Supabase Dashboard. The application does not
provide public self-registration. The auth trigger creates each new profile
with the `viewer` role. A trusted project owner must promote the first
administrator from the Supabase SQL Editor, replacing the email below:

```sql
UPDATE public.user_profiles
SET role = 'administrator', updated_at = now()
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'admin@example.com'
);
```

Only authenticated reviewers and administrators can read Alert Center tables.
Direct client writes remain denied. The Alert Center UI continues to use its
existing browser-local lifecycle until transactional server-side persistence,
reviewer authorization, and integration tests are implemented. Authentication
does not by itself make local event history central or tamper-proof.

Before production use, configure Supabase Auth site URL and allowed redirect
URLs, enforce strong passwords and MFA for administrators, review auth rate
limits/CAPTCHA settings, and test RLS with anonymous, viewer, reviewer, and
administrator accounts in a staging project.
