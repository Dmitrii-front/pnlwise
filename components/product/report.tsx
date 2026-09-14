"use client";
import { readResponse } from "@/lib/api-client";
import { config } from "@/lib/config";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  FileSpreadsheet,
  Download,
  LockKeyhole,
  Loader2,
  ChevronRight,
  Pencil,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  categories,
  calculatePnl,
  money,
  percent,
  sampleReport,
  type Report,
} from "@/lib/domain";
import { FlowSteps } from "./upload";
import { AccountPrompt } from "./account";
import { DeleteData } from "./session";
import { disclaimer } from "./shared";
type Pnl = ReturnType<typeof calculatePnl>;
export default function ReportView({
  id,
  success = false,
  cancel = false,
}: {
  id: string;
  success?: boolean;
  cancel?: boolean;
}) {
  const [report, setReport] = useState<Report | null>(
    id === "sample" ? sampleReport() : null,
  );
  const [pnl, setPnl] = useState<Pnl | null>(
    id === "sample"
      ? calculatePnl(sampleReport().transactions, "2026-01-01", "2026-03-31")
      : null,
  );
  const [price, setPrice] = useState(config.priceCents);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("summary");
  const [checkout, setCheckout] = useState(false);
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [waiting, setWaiting] = useState(success);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/reports/${id}`);
      const d = await readResponse(res);
      if (!res.ok) throw Error(d.error);
      setReport(d.report);
      setPnl(d.pnl);
      setPrice(d.priceCents);
      if (d.report.paid) setWaiting(false);
      return !!d.report.paid;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
      return false;
    }
  }, [id]);
  useEffect(() => {
    if (id === "sample") return;
    // Fetching remote report state is the external synchronization performed here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    let ticks = 0;
    const interval = success
      ? setInterval(() => {
          ticks++;
          void refresh().then((paid) => {
            if (paid || ticks >= 10) {
              clearInterval(interval);
              setWaiting(false);
            }
          });
        }, 3000)
      : undefined;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [id, refresh, success]);
  async function pay() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: id }),
      });
      const d = await readResponse(res);
      if (!res.ok) throw Error(d.error);
      window.location.assign(d.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
      setBusy(false);
    }
  }
  async function saveDetails() {
    if (!report) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/reports/${id}/recalculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision: report.revision,
          businessName: name,
          periodStart: start,
          periodEnd: end,
        }),
      });
      const d = await readResponse(res);
      if (!res.ok) throw Error(d.error);
      setReport(d.report);
      setPnl(d.pnl);
      setEdit(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  }
  async function download(format: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/reports/${id}/export/${format}`);
      if (!res.ok) {
        const d = await readResponse(res);
        throw Error(d.error);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clearledger-${report?.periodStart}-${report?.periodEnd}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Please try downloading again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!report || !pnl)
    return (
      <section className="processing-panel">
        {error ? (
          <>
            <p role="alert" className="error-box">
              {error}
            </p>
            <Button onClick={() => void refresh()}>Try again</Button>{" "}
            <a href="/generate">Start a new report</a>
          </>
        ) : (
          <p role="status">
            <Loader2 className="animate-spin mx-auto mb-4" />
            Loading your report…
          </p>
        )}
      </section>
    );
  const detail = (group: string) =>
    categories
      .filter(
        (c) => c.group === group && (pnl.totals[c.id] || mode === "detailed"),
      )
      .map((c) => (
        <div key={c.id} className="report-category">
          {mode === "detailed" ? (
            <details>
              <summary>
                <span>
                  <ChevronRight size={13} />
                  {c.label}
                </span>
                <span>{money(pnl.totals[c.id] || 0)}</span>
              </summary>
              <ul>
                {report.transactions
                  .filter(
                    (t) =>
                      t.categoryId === c.id &&
                      !t.isDuplicate &&
                      t.date >= report.periodStart &&
                      t.date <= report.periodEnd,
                  )
                  .map((t) => (
                    <li key={t.id}>
                      <span>
                        {t.normalizedMerchant} <small>{t.date}</small>
                      </span>
                      <span>
                        {money(
                          (t.direction === "credit" ? 1 : -1) *
                            (group === "revenue" ? 1 : -1) *
                            t.amount,
                        )}
                      </span>
                    </li>
                  ))}
              </ul>
            </details>
          ) : (
            <div className="report-line">
              <span>{c.label}</span>
              <span>{money(pnl.totals[c.id] || 0)}</span>
            </div>
          )}
        </div>
      ));
  return (
    <>
      <FlowSteps active={2} />
      <div className="report-page-heading">
        <div>
          <span className="eyebrow">
            {report.isSample
              ? "A LOOK AT WHAT’S POSSIBLE"
              : report.paid
                ? "YOUR REPORT IS READY"
                : "YOUR NUMBERS, IN PLAIN SIGHT"}
          </span>
          <h1>
            {report.isSample
              ? "A clear report. A clearer picture."
              : "Your P&L is ready."}
          </h1>
          <p>
            {report.isSample
              ? "Explore an illustrative report for a small creative studio."
              : "Here’s how your business performed during this period."}
          </p>
        </div>
        <span className="preview-tag">
          <CheckCircle2 size={15} />
          {report.isSample
            ? "Sample report"
            : report.paid
              ? "Payment verified"
              : "Free preview"}
        </span>
      </div>
      {cancel && (
        <p className="info-box">
          Checkout was canceled. Your report is saved and you can return to it
          when you’re ready.
        </p>
      )}
      {success && !report.paid && (
        <p className="info-box" role="status">
          {waiting
            ? "Waiting for payment confirmation. Your downloads will unlock after Stripe verifies the payment."
            : "Payment confirmation has not arrived yet. Your report is saved."}{" "}
          <button className="underline" onClick={() => void refresh()}>
            Check again
          </button>
        </p>
      )}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {report.status !== "ready" && (
        <p className="info-box">
          Your categories have changed.{" "}
          <a className="underline" href={`/generate/review?report=${id}`}>
            Review your transactions and generate the report again.
          </a>
        </p>
      )}
      <section className="report-metrics" aria-label="Report summary">
        <div>
          <span>Total revenue</span>
          <strong>{money(pnl.revenue)}</strong>
          <small>Business money in</small>
        </div>
        <div>
          <span>Total expenses</span>
          <strong>{money(pnl.totalExpenses)}</strong>
          <small>COGS, expenses & interest</small>
        </div>
        <div className="profit-metric">
          <span>Net profit</span>
          <strong>{money(pnl.netProfit)}</strong>
          <small>{percent(pnl.netMargin)} net margin</small>
        </div>
      </section>
      <div className="report-layout">
        <div>
          <div className="report-mode">
            <Tabs value={mode} onValueChange={setMode}>
              <TabsList aria-label="Report detail">
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="detailed">Detailed</TabsTrigger>
              </TabsList>
            </Tabs>
            {!report.isSample && (
              <Button
                variant="ghost"
                onClick={() => {
                  setName(report.businessName);
                  setStart(report.periodStart);
                  setEnd(report.periodEnd);
                  setEdit(true);
                }}
              >
                <Pencil size={13} /> Report details
              </Button>
            )}
          </div>
          <article className="full-report">
            <div className="full-report-brand">
              <span>{config.name.toLowerCase()}.</span>
              <small>
                {report.isSample ? "ILLUSTRATIVE SAMPLE" : "PROFIT & LOSS"}
              </small>
            </div>
            <div className="full-report-title">
              <p>{report.businessName || "Your business"}</p>
              <h2>Profit & Loss Statement</h2>
              <div>
                <span>
                  {report.periodStart} — {report.periodEnd}
                </span>
                <span>USD · Cash basis</span>
              </div>
            </div>
            <section className="report-section">
              <h3>Revenue</h3>
              {detail("revenue")}
              <div className="report-line total">
                <span>Total Revenue</span>
                <strong>{money(pnl.revenue)}</strong>
              </div>
            </section>
            <section className="report-section">
              <h3>Cost of Goods Sold</h3>
              {detail("cogs")}
              <div className="report-line total">
                <span>Total Cost of Goods Sold</span>
                <strong>{money(pnl.cogs)}</strong>
              </div>
            </section>
            <div className="gross-summary">
              <div className="report-line">
                <strong>Gross Profit</strong>
                <strong>{money(pnl.grossProfit)}</strong>
              </div>
              <div className="report-line muted">
                <span>Gross Margin</span>
                <span>{percent(pnl.grossMargin)}</span>
              </div>
            </div>
            <section className="report-section">
              <h3>Operating Expenses</h3>
              {detail("opex")}
              <div className="report-line total">
                <span>Total Operating Expenses</span>
                <strong>{money(pnl.opex)}</strong>
              </div>
            </section>
            <div className="report-line operating-total">
              <strong>Operating Profit</strong>
              <strong>{money(pnl.operatingProfit)}</strong>
            </div>
            <div className="report-line interest-line">
              <span>Interest</span>
              <span>{money(pnl.interest)}</span>
            </div>
            <div className="net-summary">
              <div className="report-line">
                <strong>Net Profit</strong>
                <strong>{money(pnl.netProfit)}</strong>
              </div>
              <div className="report-line">
                <span>Net Margin</span>
                <span>{percent(pnl.netMargin)}</span>
              </div>
            </div>
            <div className="report-excluded">
              <span>{pnl.inPeriod} transactions in period</span>
              <span>{pnl.excludedCount} excluded from P&L</span>
            </div>
            <p className="report-disclaimer">{disclaimer}</p>
          </article>
        </div>
        <aside className="download-panel">
          <div className="download-card">
            <span className="eyebrow">
              {report.paid
                ? "TAKE YOUR NUMBERS WITH YOU"
                : "READY WHEN YOU ARE"}
            </span>
            <h2>{report.paid ? "Your downloads." : "Your complete P&L."}</h2>
            <p>
              {report.paid
                ? "Your payment is verified. Save a copy for your records."
                : "Get an organized report you can save, share, and come back to."}
            </p>
            <ul>
              <li>
                <FileText />
                <div>
                  <strong>Professional PDF</strong>
                  <small>A clean, printable statement</small>
                </div>
              </li>
              <li>
                <FileSpreadsheet />
                <div>
                  <strong>Excel workbook</strong>
                  <small>Your P&L and all transactions</small>
                </div>
              </li>
              <li>
                <Download />
                <div>
                  <strong>Transaction report</strong>
                  <small>Every transaction, every category</small>
                </div>
              </li>
            </ul>
            {report.isSample ? (
              <>
                <div className="download-price">
                  {money(price)} <span>per report</span>
                </div>
                <Button className="cta" asChild>
                  <a href="/generate">
                    Create my own P&L <ArrowRight size={16} />
                  </a>
                </Button>
                <small className="download-footnote">
                  Start free. No account required.
                </small>
              </>
            ) : report.paid ? (
              <div className="download-buttons">
                {[
                  ["pdf", "Download PDF"],
                  ["xlsx", "Download Excel"],
                  ["csv", "Transaction report"],
                ].map(([format, label]) => (
                  <Button
                    key={format}
                    disabled={busy || report.status !== "ready"}
                    variant={format === "pdf" ? "default" : "outline"}
                    onClick={() => void download(format)}
                  >
                    <Download size={16} />
                    {label}
                  </Button>
                ))}
              </div>
            ) : (
              <>
                <div className="download-price">
                  {money(price)} <span>one-time</span>
                </div>
                <Button
                  className="cta"
                  disabled={busy || report.status !== "ready"}
                  onClick={() => {
                    setError("");
                    setCheckout(true);
                  }}
                >
                  Download my P&L <ArrowRight size={16} />
                </Button>
                <small className="download-footnote">
                  <LockKeyhole size={12} /> Secure payment with Stripe
                </small>
              </>
            )}
          </div>
          {!report.isSample && (
            <>
              <a
                className="back-review"
                href={`/generate/review?report=${id}`}
              >
                <ArrowLeft size={15} /> Back to transaction review
              </a>
              <div className="save-note">
                <strong>Keep access to your report.</strong>
                <p>
                  Bookmark this page and use the same browser. Session access
                  lasts up to {config.retentionDays} days. Download your files
                  for longer-term storage.
                </p>
              </div>
              <AccountPrompt reportId={id} />
              <DeleteData />
            </>
          )}
          <p className="download-note">
            No subscription. No bank login.
            <br />
            Your business, a little clearer.
          </p>
        </aside>
      </div>
      <Dialog open={checkout} onOpenChange={setCheckout}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your P&L, ready to download.</DialogTitle>
            <DialogDescription>
              One payment of {money(price)} unlocks your PDF statement, Excel
              workbook, and transaction report. You’ll continue to Stripe for
              secure checkout.
            </DialogDescription>
          </DialogHeader>
          <div className="checkout-summary">
            <span>Complete Profit & Loss report</span>
            <strong>{money(price)}</strong>
          </div>
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setCheckout(false)}
            >
              Back to preview
            </Button>
            <Button disabled={busy} onClick={() => void pay()}>
              {busy ? (
                <Loader2 className="animate-spin" />
              ) : (
                <LockKeyhole size={15} />
              )}
              Continue to payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={edit} onOpenChange={setEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report details</DialogTitle>
            <DialogDescription>
              Choose the business name and dates shown in your report.
              Transactions outside these dates stay in the transaction export
              but are excluded from the P&L.
            </DialogDescription>
          </DialogHeader>
          <label className="field">
            Business name
            <input
              type="text"
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="form-grid">
            <label className="field">
              From
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label className="field">
              To
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button disabled={busy} onClick={() => void saveDetails()}>
              Save and recalculate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
