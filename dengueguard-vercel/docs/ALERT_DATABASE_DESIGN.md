# Alert Center database design

Status: schema and repository contract prepared; central persistence is **not connected**.

## Why this stage is separate

The current Alert Center is browser-local. There is no login/identity provider,
database client, database environment configuration, or server-side event API
in this repository. Do not expose a service credential in client code or create
a public write endpoint. The SQL migration enables row-level security and
deliberately creates no client policies, so access remains denied until a
reviewer identity and server-side authorization policy are in place.

## PostgreSQL schema

Migration: `database/migrations/001_alert_center.sql`

| Table | Purpose |
| --- | --- |
| `alert_rule_profiles` | Versioned methodology, approval reference, effective week and profile status |
| `alert_rule_thresholds` | One WATCH/ALERT threshold pair per province and profile |
| `alert_evaluation_runs` | Model provenance, target/current epi weeks, freshness, checks and blocked reasons |
| `alert_events` | Stable event key, province, target week, latest signal, status and source model |
| `alert_event_transitions` | Append-only record of acknowledgement, resolution, reopening and severity changes |

The schema enforces Sunday week starts, non-negative predictions/thresholds,
ALERT > WATCH, valid model SHA shape, status values, and the invariant that
external delivery remains disabled. It does not infer an alert level from a
predicted case count. Complete 77-province threshold coverage and approval
must also be checked transactionally by the eventual server repository.

No patient records, symptom questionnaire answers, names, phone numbers, or
other patient identifiers belong in these tables.

## Server-side repository boundary

`lib/alerting/database-contract.ts` defines the interface for saving an
evaluation run, reconciling candidates, listing/filtering events, recording
reviewer transitions, and checking database readiness. It is an interface only;
there is no active adapter or API route in this stage.

The backend configuration names are reserved:

- `DENGUEYOSOKU_ALERT_DATABASE_URL`
- `DENGUEYOSOKU_ALERT_DATABASE_BACKEND_SECRET`

Both must remain server-only. The presence helper does not establish that a
connection works or that the role has the correct grants.

## Required decisions before connecting a live database

1. Select the managed PostgreSQL provider and deployment project.
2. Select the authentication provider and decide how a user becomes a reviewer
   or administrator.
3. Define who may create/edit/approve Rule Profiles and who may acknowledge or
   resolve an event.
4. Apply the migration in a staging database, verify RLS using anonymous,
   authenticated, reviewer, and service roles, and test backup/retention.
5. Implement a server-only adapter. Every write must derive actor identity from
   a verified session; never trust a client-supplied actor ID.
6. Add integration tests for transaction rollback, idempotent run fingerprints,
   event deduplication, transition permissions, and immutable transition history.
7. Only then enable centralized reads/writes in the Alert Center. Browser-local
   records should remain exportable during the migration period.

## Current behavior

Until those decisions and tests are complete, the website keeps using the
existing browser-local event history. No new database connection is attempted,
no user-facing behavior is changed, and external notifications remain disabled.
