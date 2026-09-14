"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main id="main" className="wrap error-page">
      <h1>We hit a temporary problem.</h1>
      <p>Your completed work is saved. Reload this page to try again.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
