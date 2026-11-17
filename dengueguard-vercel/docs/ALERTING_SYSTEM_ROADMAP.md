# DengueYosoku outbreak-alerting system roadmap

Status: staged implementation; automatic outbreak alerts are intentionally not enabled for
the nationwide model yet.

## Implemented dry-run foundation

The website now includes a guarded Alert Evaluation Engine in
`lib/alerting/engine.ts`, a draft-only rule profile in
`lib/alerting/profile.ts`, and a readiness/candidate panel on the nationwide
Prevention page.

- The engine validates the 77-province forecast coverage, target week, model
  revision, rule approval, and per-province threshold coverage.
- The default rule profile is Draft and contains no thresholds. Therefore the
  current run is expected to be blocked from creating Watch/Alert candidates;
  this is intentional and safer than inventing thresholds.
- Candidate events can only be simulated when a profile is explicitly approved
  and contains valid thresholds for all 77 provinces.
- Every event is marked `not_sent_dry_run_only`. External notification delivery
  is hard-disabled in the engine.
- A stale snapshot can be inspected as a historical dry-run input, but its
  freshness warning remains visible and it must not be described as current.
- Each distinct dry-run input/rule combination is recorded in a versioned,
  browser-local audit log (maximum 30 records), with model provenance,
  epidemiological weeks, rule/threshold snapshot, checks, blocked reasons,
  and candidate events. Reviewers can export the local history as JSON.
- The browser-local log is a development aid, not a centralized or tamper-proof
  audit store. Production review requires server-side persistence, access
  control, retention policy, and code-revision provenance.
- Candidate events have a browser-local lifecycle: new, acknowledged, resolved,
  and reopened only when a materially changed model/candidate snapshot is seen.
  Replaying the exact same snapshot does not reopen a manually resolved event.
  Severity changes are recorded while event identity remains stable across
  WATCH/ALERT changes and rule revisions.
- Events are never auto-resolved merely because a later run has no matching
  candidate. A reviewer must provide a reason to resolve; a later matching
  candidate reopens a resolved event. These are simulated workflow states, not
  confirmation that an outbreak has occurred or ended.

Run the engine tests from the `dengueguard-vercel` project root:

```bash
npm run test:alerts
```

The tests cover missing input, a draft profile, approved thresholds, invalid
threshold ordering, incomplete province coverage, the no-notification safety
invariant, audit provenance, duplicate-run suppression, retention limits,
local-storage failure handling, stable event identity, severity changes,
acknowledgement, reason-required resolution, reopening, and no automatic resolution.

## Decision

The outbreak-alerting system is **not being removed**. The current nationwide
DenguYosoku LightGBM export supplies weekly predicted case counts, holdout
predictions, and model-evaluation metrics. It does not supply approved
`thr_watch`, `thr_alert`, or a `level` field. The website must not infer
official alert levels from the prediction values alone.

The legacy ODPC4 dataset still contains `thr_watch`, `thr_alert`, and `level`
fields, and `public/data/meta.json` retains its historical alert evaluation
summary. Those legacy rules belong to their original dataset, geography, and
evaluation period. They must not be silently copied to the 77-province model.

## Current user-facing behavior

- The nationwide Prevention page explains that its forecast values are not
  alert categories and now shows the alert module as planned but not active.
- The legacy 8-province path remains available when the nationwide model data
  are absent or rejected by validation.
- No automated LINE, email, SMS, or other external notification is sent.
- A stale forecast may be inspected as a model-output snapshot, but must not be
  presented as the current epidemiological situation.

## Proposed architecture

Keep outbreak alerting as a layer separate from the forecasting model:

1. **Input and provenance layer**
   - Consume a validated model output with its repository, commit SHA, target
     epidemiological week, retrieval timestamp, and coverage checks.
   - Consume observed surveillance counts from an explicitly identified,
     versioned source, including the reporting cut-off and known reporting lag.
   - Validate province identifiers, reporting dates, duplicate rows, missing
     values, and freshness before evaluating any rule.
2. **Reviewed alert methodology**
   - Define the event being detected (for example, unusual weekly incidence or
     a sustained increase) before choosing thresholds.
   - Review candidate approaches with epidemiology/public-health stakeholders.
     Candidates may include province-specific historical baselines, endemic
     channels, or population-adjusted rates where suitable population
     denominators are available.
   - Document the chosen method, threshold values, intended geography,
     effective dates, exclusions, and responsible approver. Do not hard-code
     provisional thresholds as operational alerts.
3. **Alert evaluation engine**
   - Evaluate only data available at the stated decision cut-off.
   - Keep model signals and observed-surveillance signals identifiable; do not
     describe a model prediction as a confirmed outbreak.
   - Produce a structured event containing the province, target week, signal
     type, observed/predicted value, threshold and threshold version, source
     references, evaluation timestamp, and explanation.
   - Add duplicate suppression, update/resolve states, and an auditable event
     history before operational rollout. The current browser-local lifecycle is
     a development workflow only; production use needs protected server storage.
4. **Backtesting and validation**
   - Use chronological or rolling-origin evaluation; never use target-week
     observations as model inputs or rule features when simulating an earlier
     alert decision.
   - Report precision, recall, false-alert rate (including false alerts per
     province-year), lead time, missed-event rate, and performance by province
     and season.
   - Compare against simple baselines and review a sample of true positives,
     false positives, and false negatives with domain experts.
   - Record the exact data snapshot, rule version, and code/model revisions for
     reproducibility.
5. **User interface and notification delivery**
   - Start with an in-app alert centre and event history for authorized
     reviewers.
   - Show why an event was created, which source and threshold version were
     used, how fresh the data are, and what follow-up is recommended.
   - Add LINE, email, or SMS only after alert rules are approved, the event
     lifecycle is tested, recipients and permissions are defined, and delivery
     failures can be audited.

## Activation gates

Nationwide automated alerts remain disabled until all of the following are met:

- A current and documented observed-surveillance data source is available.
- The alert definition and thresholds are reviewed and approved for the target
  geography and population.
- Historical backtesting meets acceptance criteria agreed with stakeholders.
- Missing, delayed, revised, or stale data are handled explicitly.
- The event log, deduplication, acknowledgement, resolution, and audit trail
  are tested.
- Notification recipients, responsibilities, and delivery channels are
  approved.

## Implementation sequence

1. Preserve the legacy 8-province alert behavior as a clearly scoped legacy
   capability; do not re-label it as nationwide.
2. Complete the nationwide dashboard and data-quality/freshness checks.
3. Agree the alert methodology and input data contract with the model owner and
   public-health stakeholders.
4. Implement a dry-run evaluator and browser-local event lifecycle that records
   candidate events without sending notifications. Use it only for development
   review until protected server-side persistence is designed.
5. Backtest, review errors, and revise the method.
6. Release an in-app alert centre in a controlled pilot.
7. Enable external notifications only after the activation gates are satisfied.

## Safety and communication rules

- A predicted case count is not itself a probability of infection, a diagnosis,
  or confirmation of an outbreak.
- Do not display Watch/Alert labels for the 77-province model until their
  criteria are documented and approved.
- Always display the epidemiological week, source, retrieval/update time, and
  freshness state beside operational alert information.
- Keep preventive advice available even when the alert module is disabled.
