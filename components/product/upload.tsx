"use client";
import { readResponse } from "@/lib/api-client";
import { config } from "@/lib/config";
import { money } from "@/lib/domain";
import { useRef, useState } from "react";
import {
  UploadCloud,
  FileText,
  X,
  LockKeyhole,
  ArrowRight,
  Loader2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { businessTypes } from "@/lib/domain";
export function FlowSteps({ active }: { active: number }) {
  return (
    <ol className="flow-steps" aria-label="Report progress">
      {["Upload statements", "Review transactions", "Your P&L"].map((s, i) => (
        <li
          key={s}
          className={i === active ? "active" : i < active ? "complete" : ""}
          aria-current={i === active ? "step" : undefined}
        >
          <span>{i < active ? <Check size={13} /> : i + 1}</span>
          {s}
        </li>
      ))}
    </ol>
  );
}
export default function UploadForm() {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [periodStart, setStart] = useState("");
  const [periodEnd, setEnd] = useState("");
  const [all, setAll] = useState("yes");
  const [account, setAccount] = useState("");
  const [accounts, setAccounts] = useState<Record<string, string>>({});
  const [reportId, setReportId] = useState("");
  const [done, setDone] = useState<string[]>([]);
  const [mapping, setMapping] = useState<{
    file: File;
    headers: string[];
  } | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  function add(incoming: File[]) {
    setError("");
    const accepted: File[] = [];
    for (const f of incoming) {
      if (!/\.(pdf|csv|xlsx)$/i.test(f.name)) {
        setError("Choose a PDF, CSV, or XLSX bank statement.");
        continue;
      }
      if (f.size > 10 * 1024 * 1024) {
        setError(`${f.name}: choose a file smaller than 10 MB.`);
        continue;
      }
      if (!f.size) {
        setError(
          `${f.name} is empty. Download a new statement from your bank.`,
        );
        continue;
      }
      if (
        files.some((x) => x.name === f.name && x.size === f.size) ||
        accepted.some((x) => x.name === f.name && x.size === f.size)
      ) {
        setError("That file is already in your list.");
        continue;
      }
      accepted.push(f);
    }
    setFiles((prev) => [...prev, ...accepted].slice(0, 24));
    if (files.length + accepted.length > 24)
      setError("Upload up to 24 statements per report.");
  }
  async function uploadFile(
    f: File,
    id: string,
    mappingData?: Record<string, string>,
  ) {
    const fd = new FormData();
    fd.append("file", f);
    fd.append("reportId", id);
    fd.append("account", accounts[f.name + f.size] || account);
    if (mappingData) fd.append("mapping", JSON.stringify(mappingData));
    const response = await fetch("/api/statements/upload", {
      method: "POST",
      body: fd,
    });
    const data = await readResponse(response);
    if (!response.ok) {
      if (data.details?.headers) {
        setMapping({ file: f, headers: data.details.headers });
        setMap({});
      }
      throw Error(
        data.error ||
          "We couldn’t read this statement. Please try a CSV export.",
      );
    }
    return data;
  }
  async function analyze(mappingData?: Record<string, string>) {
    setError("");
    if (!files.length) {
      setError("Add at least one bank statement to get started.");
      input.current?.focus();
      return;
    }
    if (!businessTypes.includes(businessType)) {
      setError("Select the type of business for this report.");
      return;
    }
    if (
      (periodStart && !periodEnd) ||
      (!periodStart && periodEnd) ||
      (periodStart && periodEnd && periodStart > periodEnd)
    ) {
      setError("Enter both dates, with the end date after the start date.");
      return;
    }
    setBusy(true);
    try {
      let id = reportId;
      if (!id) {
        const res = await fetch("/api/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessType,
            businessName,
            periodStart,
            periodEnd,
          }),
        });
        const d = await readResponse(res);
        if (!res.ok) throw Error(d.error);
        id = d.report.id;
        setReportId(id);
      }
      const completed = [...done];
      for (const f of files) {
        const key = f.name + f.size;
        if (completed.includes(key)) continue;
        setStatus(
          `Reading ${f.name} (${completed.length + 1} of ${files.length})`,
        );
        await uploadFile(f, id, mapping?.file === f ? mappingData : undefined);
        completed.push(key);
        setDone([...completed]);
        if (mapping?.file === f) setMapping(null);
      }
      window.location.href = `/generate/processing?report=${id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry your upload.");
    } finally {
      setBusy(false);
      setStatus("");
    }
  }
  return (
    <>
      <FlowSteps active={0} />
      <div className="work-heading">
        <span className="eyebrow">LET’S GET YOUR NUMBERS IN ORDER</span>
        <h1>Start with your statements.</h1>
        <p>One month or a whole year. We’ll bring it all together.</p>
      </div>
      <div className="upload-layout">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void analyze();
          }}
        >
          <section className="work-panel">
            <div className="panel-heading">
              <h2>Bank statements</h2>
              <span>PDF, CSV, or Excel</span>
            </div>
            <div
              className={`drop-area ${drag ? "dragging" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                if (!busy) add(Array.from(e.dataTransfer.files));
              }}
            >
              <UploadCloud size={34} />
              <h3>Drop your bank statements here</h3>
              <p>Up to 24 files · 10 MB per file</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => input.current?.click()}
                disabled={busy}
              >
                Choose files
              </Button>
              <input
                ref={input}
                className="sr-only"
                type="file"
                multiple
                accept=".pdf,.csv,.xlsx"
                aria-label="Upload bank statements"
                onChange={(e) => {
                  add(Array.from(e.target.files || []));
                  e.target.value = "";
                }}
                disabled={busy}
              />
            </div>
            {files.length > 0 && (
              <ul className="upload-files">
                {files.map((f, i) => (
                  <li key={f.name + f.size}>
                    <FileText size={21} />
                    <div>
                      <strong>{f.name}</strong>
                      <small>
                        {(f.size / 1024).toFixed(0)} KB{" "}
                        {done.includes(f.name + f.size)
                          ? "· Read successfully"
                          : ""}
                      </small>
                      <input
                        className="file-account"
                        type="text"
                        maxLength={40}
                        aria-label={`Account for ${f.name}`}
                        placeholder="Account label (optional)"
                        value={accounts[f.name + f.size] || ""}
                        disabled={busy || done.includes(f.name + f.size)}
                        onChange={(e) =>
                          setAccounts({
                            ...accounts,
                            [f.name + f.size]: e.target.value,
                          })
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${f.name}`}
                      disabled={busy || done.includes(f.name + f.size)}
                      onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    >
                      <X size={17} />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <p className="upload-help">
              Text-based PDFs work best. Have a scanned statement? A CSV or
              Excel export is the most reliable option.
            </p>
            <label className="field">
              Account label{" "}
              <span className="optional">
                optional · helps identify transfers
              </span>
              <input
                type="text"
                value={account}
                maxLength={40}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="e.g. Business checking 1234"
                disabled={busy || !!reportId}
              />
            </label>
          </section>
          <section className="work-panel">
            <div className="panel-heading">
              <h2>A little about your business</h2>
            </div>
            <div className="form-grid">
              <label className="field">
                Business type
                <Select
                  value={businessType}
                  onValueChange={setBusinessType}
                  disabled={busy || !!reportId}
                >
                  <SelectTrigger aria-label="Business type">
                    <SelectValue placeholder="Select your business type" />
                  </SelectTrigger>
                  <SelectContent>
                    {businessTypes.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="field">
                Business name <span className="optional">optional</span>
                <input
                  type="text"
                  value={businessName}
                  maxLength={100}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Your business name"
                  disabled={busy || !!reportId}
                />
              </label>
            </div>
            <fieldset className="period-fields">
              <legend>
                Reporting period{" "}
                <span className="optional">
                  we’ll detect this if left blank
                </span>
              </legend>
              <div className="form-grid">
                <label className="field">
                  From
                  <input
                    aria-label="Period start"
                    type="date"
                    value={periodStart}
                    onChange={(e) => setStart(e.target.value)}
                    disabled={busy || !!reportId}
                  />
                </label>
                <label className="field">
                  To
                  <input
                    aria-label="Period end"
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setEnd(e.target.value)}
                    disabled={busy || !!reportId}
                  />
                </label>
              </div>
            </fieldset>
            <label className="field">
              Are these all your business accounts for this period?
              <Select value={all} onValueChange={setAll}>
                <SelectTrigger aria-label="All business accounts">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">
                    Yes, these are all my accounts
                  </SelectItem>
                  <SelectItem value="no">No, I have more statements</SelectItem>
                </SelectContent>
              </Select>
            </label>
            {all === "no" && (
              <p className="info-box">
                Add the remaining statements above for a more complete P&L.
                Include every business account used during this period.
              </p>
            )}
          </section>
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          <div className="upload-submit">
            <span>
              <LockKeyhole size={14} /> Private processing. No bank connection.
            </span>
            <Button className="cta" disabled={busy} type="submit">
              {busy ? (
                <>
                  <Loader2 className="animate-spin" />
                  Reading statements…
                </>
              ) : (
                <>
                  Analyze statements <ArrowRight size={17} />
                </>
              )}
            </Button>
          </div>
          <p role="status" aria-live="polite" className="muted status-line">
            {status}
          </p>
        </form>
        <aside className="upload-aside">
          <span className="eyebrow">WHAT YOU’LL GET</span>
          <h2>
            A clear picture.
            <br />
            Without the busywork.
          </h2>
          <ul>
            {[
              "Revenue and expense totals",
              "Your gross and net profit",
              "Categories you can review",
              "PDF and Excel downloads",
            ].map((t) => (
              <li key={t}>
                <Check size={17} />
                {t}
              </li>
            ))}
          </ul>
          <div className="aside-price">
            <strong>Free to preview.</strong>
            <p>
              {money(config.priceCents)} + applicable tax to download your
              report.
              <br />
              One payment. No subscription.
            </p>
          </div>
          <div className="aside-trust">
            <LockKeyhole />
            <strong>You’re in control of your data.</strong>
            <p>
              Source files are discarded after reading. Your report stays
              private to this browser session. Delete it any time.
            </p>
            <a href="/security">More about security</a>
          </div>
          <a href="/report/sample" className="text-link">
            Explore a sample report <ArrowRight size={15} />
          </a>
        </aside>
      </div>
      <Dialog
        open={!!mapping}
        onOpenChange={(open) => {
          if (!open) setMapping(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Match your statement columns</DialogTitle>
            <DialogDescription>
              We need a little help reading {mapping?.file.name}. Select the
              date, description, and either an amount with its direction or
              separate debit and credit columns.
            </DialogDescription>
          </DialogHeader>
          {[
            "date",
            "description",
            "amount",
            "direction",
            "debit",
            "credit",
            "currency",
          ].map((k) => (
            <label key={k} className="field">
              {k.charAt(0).toUpperCase() + k.slice(1)}
              <Select
                value={map[k] || "none"}
                onValueChange={(v) =>
                  setMap({ ...map, [k]: v === "none" ? "" : v })
                }
              >
                <SelectTrigger aria-label={`Map ${k}`}>
                  <SelectValue placeholder="Not used" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not used</SelectItem>
                  {mapping?.headers.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          ))}
          {map.amount && !map.direction && !map.debit && !map.credit ? (
            <label className="field">
              Signed amount convention
              <Select
                value={map.convention || undefined}
                onValueChange={(v) => setMap({ ...map, convention: v })}
              >
                <SelectTrigger aria-label="Amount convention">
                  <SelectValue placeholder="Choose money in or money out" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit-positive">
                    Positive = money in / credit
                  </SelectItem>
                  <SelectItem value="debit-positive">
                    Positive = money out / debit
                  </SelectItem>
                </SelectContent>
              </Select>
            </label>
          ) : null}
          <DialogFooter>
            <Button
              disabled={
                busy ||
                !map.date ||
                !map.description ||
                !(map.amount || map.debit || map.credit) ||
                (!!map.amount &&
                  !map.direction &&
                  !map.debit &&
                  !map.credit &&
                  !map.convention)
              }
              onClick={() => void analyze(map)}
            >
              Use these columns
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
