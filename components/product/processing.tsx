"use client";
import { readResponse } from "@/lib/api-client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle, Loader2, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FlowSteps } from "./upload";
export default function Processing({ id }: { id: string }) {
  const [stage, setStage] = useState(0);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const running = useRef(false);
  useEffect(() => {
    let canceled = false;
    if (running.current) return;
    running.current = true;
    async function run() {
      try {
        let response = await fetch(`/api/reports/${id}`);
        let data = await readResponse(response);
        if (!response.ok) throw Error(data.error);
        let step = data.report.stage;
        while (step < 6) {
          if (canceled) return;
          setStage(step);
          response = await fetch(`/api/reports/${id}/process`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stage: step }),
          });
          data = await readResponse(response);
          if (!response.ok) throw Error(data.error);
          step = data.report.stage;
        }
        if (!canceled) {
          setStage(6);
          window.location.replace(`/generate/review?report=${id}`);
        }
      } catch (e) {
        if (!canceled)
          setError(e instanceof Error ? e.message : "Please try again.");
      } finally {
        running.current = false;
      }
    }
    void run();
    return () => {
      canceled = true;
      running.current = false;
    };
  }, [id, attempt]);
  return (
    <>
      <FlowSteps active={0} />
      <section className="processing-panel">
        <FileCheck2 size={38} className="mx-auto mb-6 text-primary" />
        <h1>Bringing your numbers together.</h1>
        <p>We’ll keep your completed work safe as each step finishes.</p>
        <ol className="processing-list" aria-live="polite">
          {[
            "Reading statements",
            "Extracting transactions",
            "Checking for duplicates",
            "Detecting transfers",
            "Categorizing transactions",
            "Building your P&L",
          ].map((label, i) => (
            <li
              key={label}
              className={i < stage ? "done" : i === stage ? "current" : ""}
            >
              <span>
                {i < stage ? (
                  <CheckCircle2 />
                ) : i === stage && !error ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Circle />
                )}
              </span>
              {label}
              {i === stage && <span className="sr-only">In progress</span>}
            </li>
          ))}
        </ol>
        {error && (
          <>
            <p className="error-box" role="alert">
              {error}
            </p>
            <div className="report-actions justify-center">
              <Button
                onClick={() => {
                  setError("");
                  setAttempt((a) => a + 1);
                }}
              >
                Retry this step
              </Button>
              <Button asChild variant="outline">
                <a href="/generate">Start a new report</a>
              </Button>
            </div>
          </>
        )}
        <p className="muted text-sm">
          You’ll review uncertain transactions before generating your report.
        </p>
      </section>
    </>
  );
}
