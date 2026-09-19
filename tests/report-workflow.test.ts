import assert from "node:assert/strict";
import test from "node:test";
import {
  reportWorkflowPath,
  reportWorkflowStep,
} from "../lib/report-workflow";

const report = (status: string, stage: number) => ({
  id: "report id",
  status,
  stage,
});

test("workflow routing sends drafts, processing, review, and ready reports to one authoritative route", () => {
  assert.equal(reportWorkflowStep(report("upload", 0)), "upload");
  assert.equal(
    reportWorkflowPath(report("upload", 0)),
    "/generate?report=report%20id",
  );
  assert.equal(reportWorkflowStep(report("processing", 3)), "processing");
  assert.equal(
    reportWorkflowPath(report("processing", 3)),
    "/generate/processing?report=report%20id",
  );
  assert.equal(reportWorkflowStep(report("review", 6)), "review");
  assert.equal(
    reportWorkflowPath(report("review", 6)),
    "/generate/review?report=report%20id",
  );
  assert.equal(reportWorkflowStep(report("ready", 6)), "report");
  assert.equal(reportWorkflowPath(report("ready", 6)), "/report/report%20id");
});

test("workflow routing fails closed for inconsistent persisted stage data", () => {
  assert.equal(reportWorkflowStep(report("upload", 2)), "processing");
  assert.equal(reportWorkflowStep(report("unknown", 6)), "review");
  assert.equal(reportWorkflowStep(report("ready", 2)), "report");
});
