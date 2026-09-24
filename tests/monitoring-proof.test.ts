import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { safeOperationalDiagnostic } from "../lib/operational-diagnostics";
import { maintenanceAuthorized } from "../lib/retention";

const routeSource = readFileSync(
  new URL("../app/api/monitoring/proof/route.ts", import.meta.url),
  "utf8",
);

test("monitoring proof is staging-only and rejects production before protected work", () => {
  const environmentGuard = routeSource.indexOf(
    'if (setting("SENTRY_ENVIRONMENT") !== "staging")',
  );
  const authentication = routeSource.indexOf("if (\n        !maintenanceAuthorized(");
  const reporter = routeSource.indexOf(
    "const result = await reportOperationalError(",
  );

  assert.notEqual(environmentGuard, -1);
  assert.notEqual(authentication, -1);
  assert.notEqual(reporter, -1);
  assert.ok(environmentGuard < authentication);
  assert.ok(authentication < reporter);
  assert.match(
    routeSource.slice(environmentGuard, authentication),
    /throw new AppError\("Not found\.", 404\)/,
  );
  assert.doesNotMatch(routeSource, /readBoundedRequestBody|request\.body/);
});

test("removed production intent cannot enable monitoring proof", () => {
  assert.doesNotMatch(
    routeSource,
    /X-Pnlwise-Monitoring-Proof|x-pnlwise-monitoring-proof|production-proof-v1/,
  );
  assert.doesNotMatch(
    routeSource,
    /PNLWISE_SENTRY_PRODUCTION_PROOF_V1|monitoring\.production_proof|pnlwise-production-proof/,
  );
});

test("staging proof retains authenticated privacy-safe diagnostic behavior", () => {
  const secret = "local-staging-proof-secret-value";
  assert.equal(maintenanceAuthorized(`Bearer ${secret}`, secret), true);
  assert.equal(maintenanceAuthorized(null, secret), false);
  assert.equal(maintenanceAuthorized("Bearer wrong-secret-value", secret), false);

  assert.match(routeSource, /code: "PNLWISE_OBS_STAGING_PROOF"/);
  assert.match(routeSource, /stage: "monitoring\.staging_proof"/);
  assert.match(routeSource, /subsystem: "monitoring"/);
  assert.match(routeSource, /route: "api\.monitoring\.proof"/);
  assert.match(routeSource, /retryable: false/);
  assert.match(routeSource, /alertable: true/);

  assert.deepEqual(
    safeOperationalDiagnostic({
      code: "PNLWISE_OBS_STAGING_PROOF",
      stage: "monitoring.staging_proof",
      subsystem: "monitoring",
      route: "api.monitoring.proof",
      retryable: false,
      alertable: true,
    }),
    {
      event: "operational_error",
      code: "PNLWISE_OBS_STAGING_PROOF",
      stage: "monitoring.staging_proof",
      subsystem: "monitoring",
      route: "api.monitoring.proof",
      retryable: false,
      alertable: true,
    },
  );
});

test("monitoring proof route has no application-state or provider dependency", () => {
  assert.doesNotMatch(
    routeSource,
    /\bdb\s*\(|\btrack\s*\(|getReport|saveReport|session\s*\(|openai|paddle/i,
  );
});
