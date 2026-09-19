import type { Report } from "./domain";

export type ReportWorkflowStep = "upload" | "processing" | "review" | "report";

export function reportWorkflowStep(
  report: Pick<Report, "status" | "stage">,
): ReportWorkflowStep {
  if (report.status === "ready") return "report";
  if (report.status === "review" || report.stage >= 6) return "review";
  if (report.status === "processing" || report.stage > 0) return "processing";
  return "upload";
}

export function reportWorkflowPath(
  report: Pick<Report, "id" | "status" | "stage">,
) {
  const id = encodeURIComponent(report.id);
  switch (reportWorkflowStep(report)) {
    case "processing":
      return `/generate/processing?report=${id}`;
    case "review":
      return `/generate/review?report=${id}`;
    case "report":
      return `/report/${id}`;
    default:
      return `/generate?report=${id}`;
  }
}
