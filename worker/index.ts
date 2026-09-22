import vinextHandler from "vinext/server/fetch-handler";
import { cleanupExpired } from "../lib/server";
import type { RetentionDiagnostic } from "../lib/retention";
import { createWorkerHandler } from "./handler";

function logDiagnostic(entry: RetentionDiagnostic) {
  console.info(entry.event, entry);
}

export default createWorkerHandler(
  vinextHandler,
  () => cleanupExpired(true),
  logDiagnostic,
);
