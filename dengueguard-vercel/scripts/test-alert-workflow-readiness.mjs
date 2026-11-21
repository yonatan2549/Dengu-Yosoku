import test from "node:test";
import assert from "node:assert/strict";
import { assessAlertWorkflowReadiness } from "../.next/alert-workflow-readiness-tests/lib/alerting/workflow-readiness.js";

const readyPayload = {
  ok: true,
  role: "administrator",
  workflowMigrations: { migration005: "ready", migration006: "ready" },
};

test("reports both workflow migrations ready from a successful read-only DB probe", () => {
  const report = assessAlertWorkflowReadiness(200, readyPayload);
  assert.equal(report.status, "ready");
  assert.equal(report.migration005, "ready");
  assert.equal(report.migration006, "ready");
  assert.equal(report.role, "administrator");
});

test("reports Migration 005 missing while Migration 006 remains available", () => {
  const report = assessAlertWorkflowReadiness(503, {
    error: "missing 005",
    workflowMigrations: { migration005: "missing", migration006: "ready" },
  });
  assert.equal(report.status, "partial");
  assert.equal(report.migration005, "missing");
  assert.equal(report.migration006, "ready");
});

test("reports Migration 006 missing while Draft Workflow is available", () => {
  const report = assessAlertWorkflowReadiness(503, {
    error: "missing 006",
    workflowMigrations: { migration005: "ready", migration006: "missing" },
  });
  assert.equal(report.status, "partial");
  assert.equal(report.migration005, "ready");
  assert.equal(report.migration006, "missing");
});

test("blocks when both workflow migrations are missing", () => {
  const report = assessAlertWorkflowReadiness(503, {
    workflowMigrations: { migration005: "missing", migration006: "missing" },
  });
  assert.equal(report.status, "blocked");
});

test("does not infer missing migrations when a profile is absent and probes were skipped", () => {
  const report = assessAlertWorkflowReadiness(200, {
    ok: true,
    workflowMigrations: { migration005: "not_checked", migration006: "not_checked" },
  });
  assert.equal(report.status, "unavailable");
  assert.equal(report.migration005, "not_checked");
  assert.equal(report.migration006, "not_checked");
});

test("preserves signed-out status without probing database migrations", () => {
  assert.equal(assessAlertWorkflowReadiness(401, {}).status, "signed_out");
});

test("preserves forbidden status without probing database migrations", () => {
  assert.equal(assessAlertWorkflowReadiness(403, {}).status, "forbidden");
});

test("reports unavailable on database or payload errors without declaring migrations missing", () => {
  const report = assessAlertWorkflowReadiness(502, { error: "database unavailable" });
  assert.equal(report.status, "unavailable");
  assert.equal(report.migration005, "unavailable");
  assert.equal(report.migration006, "unavailable");
});
