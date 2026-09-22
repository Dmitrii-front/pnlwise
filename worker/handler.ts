import {
  executeRetentionMaintenance,
  type RetentionDiagnostic,
  type RetentionResult,
} from "../lib/retention";

export function createWorkerHandler(
  vinextHandler: Pick<ExportedHandler, "fetch">,
  cleanup: () => Promise<RetentionResult>,
  diagnostic: (entry: RetentionDiagnostic) => void,
): ExportedHandler {
  return {
    fetch(request, env, context) {
      return vinextHandler.fetch!(request, env, context);
    },
    async scheduled() {
      await executeRetentionMaintenance(cleanup, diagnostic);
    },
  } satisfies ExportedHandler;
}
