"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Mail, Loader2 } from "lucide-react";
export function AccountPrompt({
  reportId,
  initialOpen = false,
}: {
  reportId?: string;
  initialOpen?: boolean;
}) {
  const [enabled, setEnabled] = useState(false);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(initialOpen);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((d) => {
        const data = d as { enabled: boolean; email: string | null };
        setEnabled(data.enabled);
        setCurrentEmail(data.email);
      })
      .catch(() => {});
  }, []);
  async function signin(provider: "email" | "google") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, email, reportId }),
      });
      const d = (await res.json()) as { error?: string; url?: string };
      if (!res.ok) throw Error(d.error);
      if (d.url) window.location.assign(d.url);
      else setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  }
  if (currentEmail)
    return (
      <div className="save-note">
        <strong>Saved to your account.</strong>
        <p>{currentEmail}</p>
        <Button
          variant="ghost"
          onClick={() =>
            void fetch("/api/auth/signout", { method: "POST" }).then(() =>
              (window.location.href = "/generate"),
            )
          }
        >
          Sign out
        </Button>
      </div>
    );
  if (!enabled)
    return initialOpen ? (
      <p className="info-box">
        Sign-in is not configured for this preview. You can create and download
        a report without an account.
      </p>
    ) : null;
  return (
    <>
      <div className="save-note">
        <strong>Want access in another browser?</strong>
        <p>
          Create a free account or sign in to keep this report linked to you.
        </p>
        <Button variant="outline" onClick={() => setOpen(true)}>
          Create free account / Sign in
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keep your report within reach.</DialogTitle>
            <DialogDescription>
              Sign in with a magic link or Google. No password needed. Account
              creation is optional.
            </DialogDescription>
          </DialogHeader>
          {sent ? (
            <p className="info-box" role="status">
              Check your email. Open the sign-in link in this browser to link
              your report.
            </p>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void signin("google")}
              >
                Continue with Google
              </Button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void signin("email");
                }}
              >
                <label className="field">
                  Email address
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@business.com"
                  />
                </label>
                <Button className="w-full mt-4" disabled={busy} type="submit">
                  {busy ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Mail size={16} />
                  )}
                  Send sign-in link
                </Button>
              </form>
            </>
          )}
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Continue without account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
