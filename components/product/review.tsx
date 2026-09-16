"use client";
import { readResponse } from "@/lib/api-client";
import { useCallback, useEffect, useState } from "react";
import {
  Search,
  ArrowRight,
  Check,
  SlidersHorizontal,
  Loader2,
  CircleHelp,
  Files,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
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
  confidenceThresholds,
  categoryById,
  needsReview,
  money,
  type Report,
  type Transaction,
} from "@/lib/domain";
import { FlowSteps } from "./upload";
import { DeleteData } from "./session";

function reviewStatus(t: Transaction) {
  if (t.categoryId === "refund") return { label: "Review", level: "low" };
  if (t.userConfirmed) return { label: "Confirmed", level: "confirmed" };
  if (t.confidence >= confidenceThresholds.high)
    return { label: "High", level: "high" };
  if (t.confidence >= confidenceThresholds.review)
    return { label: "Medium", level: "medium" };
  return { label: "Review", level: "low" };
}

export function CategoryPicker({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="category-select" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {[
          ["revenue", "Revenue"],
          ["cogs", "Cost of goods sold"],
          ["opex", "Operating expenses"],
          ["interest", "Interest"],
          ["excluded", "Excluded from P&L"],
        ].map(([group, title]) => (
          <SelectGroup key={group}>
            <SelectLabel>{title}</SelectLabel>
            {categories
              .filter((c) => c.group === group)
              .map((c) => (
                <SelectItem
                  key={c.id}
                  value={c.id}
                  disabled={c.id === "refund"}
                >
                  {c.label}
                </SelectItem>
              ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
export default function Review({ id }: { id: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("Needs Review");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState("personal");
  const [edit, setEdit] = useState<{ t: Transaction; category: string } | null>(
    null,
  );
  const [split, setSplit] = useState<Transaction | null>(null);
  const [interest, setInterest] = useState("");
  const [page, setPage] = useState(0);
  const refresh = useCallback(async () => {
    setError("");
    try {
      const res = await fetch(`/api/reports/${id}`);
      const d = await readResponse(res);
      if (!res.ok) throw Error(d.error);
      setReport(d.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    }
  }, [id]);
  useEffect(() => {
    // Fetching remote report state is the external synchronization performed here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "review_started" }),
    });
  }, [refresh]);
  async function update(ids: string[], categoryId?: string, always = false) {
    if (!report) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/transactions/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId: id,
          revision: report.revision,
          ids,
          categoryId,
          always,
        }),
      });
      const d = await readResponse(res);
      if (!res.ok) throw Error(d.error);
      setReport(d.report);
      setSelected([]);
      setEdit(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    if (!report) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/reports/${id}/recalculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: report.revision }),
      });
      const d = await readResponse(res);
      if (!res.ok) throw Error(d.error);
      window.location.href = `/report/${id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  }
  async function splitLoan() {
    if (!report || !split) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/reports/${id}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision: report.revision,
          transactionId: split.id,
          interest,
        }),
      });
      const d = await readResponse(res);
      if (!res.ok) throw Error(d.error);
      setReport(d.report);
      setSplit(null);
      setInterest("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  }
  if (!report)
    return (
      <div className="processing-panel">
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
            Loading your transactions…
          </p>
        )}
      </div>
    );
  const review = report.transactions.filter(
    (t) =>
      needsReview(t) &&
      t.date >= report.periodStart &&
      t.date <= report.periodEnd,
  );
  const filter = (t: Transaction) => {
    if (
      query &&
      !`${t.rawDescription} ${t.normalizedMerchant}`
        .toLowerCase()
        .includes(query.toLowerCase())
    )
      return false;
    if (tab === "Needs Review")
      return (
        needsReview(t) &&
        t.date >= report.periodStart &&
        t.date <= report.periodEnd
      );
    if (tab === "Income") return categoryById[t.categoryId].group === "revenue";
    if (tab === "Expenses")
      return ["opex", "cogs", "interest"].includes(
        categoryById[t.categoryId].group,
      );
    if (tab === "Transfers") return t.isTransfer;
    if (tab === "Personal") return t.isPersonal;
    return true;
  };
  const filtered = report.transactions.filter(filter);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 50));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * 50, (safePage + 1) * 50);
  const toggle = (transactionId: string) =>
    setSelected((prev) =>
      prev.includes(transactionId)
        ? prev.filter((x) => x !== transactionId)
        : [...prev, transactionId],
    );
  return (
    <>
      <FlowSteps active={1} />
      <div className="review-heading">
        <div>
          <span className="eyebrow">A QUICK CHECK, THEN YOU’RE READY</span>
          <h1>Review your transactions.</h1>
          <p>
            {review.length ? (
              <>
                We found <strong>{review.length} transactions</strong> that need
                your attention.
              </>
            ) : (
              <>Everything is reviewed. Your P&L is ready to generate.</>
            )}
          </p>
        </div>
        <Button
          onClick={() => void generate()}
          disabled={busy || !!review.length}
          className="cta"
        >
          Generate P&L <ArrowRight size={17} />
        </Button>
      </div>
      <div className="review-summary">
        <span>
          <Files size={16} />
          {report.statements.length} statements
        </span>
        <span>{report.transactions.length} transactions</span>
        <span>
          {report.periodStart} — {report.periodEnd}
        </span>
        <span className="tag">USD · Cash basis</span>
      </div>
      {report.warnings.length > 0 && (
        <details className="analysis-notes">
          <summary>
            <CircleHelp size={15} /> Analysis notes ({report.warnings.length})
          </summary>
          {report.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </details>
      )}
      {error && (
        <p className="error-box" role="alert">
          {error}{" "}
          <button className="underline" onClick={() => void refresh()}>
            Refresh report
          </button>
        </p>
      )}
      <div className="review-panel">
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v);
            setPage(0);
            setSelected([]);
          }}
        >
          <div className="review-toolbar">
            <TabsList variant="line" aria-label="Transaction filters">
              {[
                "Needs Review",
                "Income",
                "Expenses",
                "Transfers",
                "Personal",
                "All",
              ].map((t) => (
                <TabsTrigger key={t} value={t}>
                  {t}
                  {t === "Needs Review" && (
                    <span className="count-badge">{review.length}</span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
            <label className="search-field">
              <Search size={16} />
              <input
                type="search"
                placeholder="Search transactions"
                aria-label="Search transactions"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
              />
            </label>
          </div>
        </Tabs>
        {selected.length > 0 && (
          <div className="bulk-bar">
            <span>{selected.length} selected</span>
            <CategoryPicker
              value={bulk}
              label="Bulk category"
              onChange={setBulk}
            />
            <Button disabled={busy} onClick={() => void update(selected, bulk)}>
              Apply category
            </Button>
            <Button variant="ghost" onClick={() => setSelected([])}>
              Clear
            </Button>
          </div>
        )}
        {visible.length === 0 ? (
          <div className="empty-state">
            <Check size={30} />
            <h2>
              {tab === "Needs Review" && !query
                ? "No transactions need review."
                : "No matching transactions."}
            </h2>
            <p>
              {tab === "Needs Review" && !query
                ? "Great — everything looks ready. You can still browse and edit all your transactions."
                : "Try a different filter or search term."}
            </p>
            {tab === "Needs Review" && !query && (
              <Button onClick={() => void generate()} disabled={busy}>
                Generate P&L <ArrowRight size={16} />
              </Button>
            )}
          </div>
        ) : (
          <table className="transaction-table">
            <caption className="sr-only">
              Review and categorize bank transactions
            </caption>
            <thead>
              <tr>
                <th>
                  <label className="check-target">
                    <Checkbox
                      aria-label="Select visible transactions"
                      checked={visible.every((t) => selected.includes(t.id))}
                      onCheckedChange={(checked) =>
                        setSelected(
                          checked
                            ? [
                                ...new Set([
                                  ...selected,
                                  ...visible.map((t) => t.id),
                                ]),
                              ]
                            : selected.filter(
                                (id) => !visible.some((t) => t.id === id),
                              ),
                        )
                      }
                    />
                  </label>
                </th>
                <th>Date / Description</th>
                <th className="amount-column">Amount</th>
                <th>Category</th>
                <th>Confidence</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr
                  key={t.id}
                  className={selected.includes(t.id) ? "selected" : ""}
                >
                  <td>
                    <label className="check-target">
                      <Checkbox
                        aria-label={`Select ${t.rawDescription}`}
                        checked={selected.includes(t.id)}
                        onCheckedChange={() => toggle(t.id)}
                      />
                    </label>
                  </td>
                  <td>
                    <span className="transaction-date">{t.date}</span>
                    <strong className="transaction-description">
                      {t.normalizedMerchant}
                    </strong>
                    <small className="transaction-raw">
                      {t.rawDescription}
                    </small>
                    {t.duplicateOf && !t.userConfirmed && (
                      <span className="duplicate-flag">
                        Possible duplicate — confirm before excluding
                      </span>
                    )}
                  </td>
                  <td
                    className={`amount-column ${t.direction === "credit" ? "income-amount" : ""}`}
                  >
                    <span className="amount-mobile-label">Amount</span>
                    {t.direction === "credit" ? "+" : "−"}
                    {money(t.amount)}
                  </td>
                  <td>
                    <CategoryPicker
                      value={t.categoryId}
                      disabled={busy}
                      label={`Category for ${t.rawDescription}`}
                      onChange={(category) => setEdit({ t, category })}
                    />
                  </td>
                  <td>
                    <span className={`confidence ${reviewStatus(t).level}`}>
                      {reviewStatus(t).label}
                    </span>
                    <details className="reason">
                      <summary>Why?</summary>
                      <p>{t.aiReason}</p>
                    </details>
                  </td>
                  <td>
                    <div className="transaction-actions">
                      {t.categoryId === "refund" ? (
                        <span className="text-muted-foreground text-sm">
                          Choose category
                        </span>
                      ) : t.userConfirmed ? (
                        <Check
                          size={17}
                          aria-label="Confirmed"
                          className="text-primary"
                        />
                      ) : (
                        <Button
                          variant="ghost"
                          aria-label={`Confirm ${t.rawDescription}`}
                          disabled={busy || t.categoryId === "unknown"}
                          onClick={() => void update([t.id])}
                        >
                          Confirm
                        </Button>
                      )}
                      {t.duplicateOf && !t.userConfirmed && (
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void update([t.id], "duplicate")}
                        >
                          Duplicate
                        </Button>
                      )}
                      {t.categoryId === "loan-principal" && (
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            setSplit(t);
                            setInterest("");
                          }}
                        >
                          Split interest
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="table-footer">
          <span>
            {filtered.length
              ? `${safePage * 50 + 1}–${Math.min((safePage + 1) * 50, filtered.length)} of ${filtered.length} transactions`
              : "0 transactions"}
          </span>
          <div>
            <Button
              variant="ghost"
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
            >
              Previous
            </Button>
            <Button
              variant="ghost"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(safePage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
      <div className="review-bottom">
        <p>
          <SlidersHorizontal size={15} /> All categories can be changed.
          Excluded items stay in your transaction report.
        </p>
        <DeleteData />
      </div>
      <Dialog
        open={!!edit}
        onOpenChange={(open) => {
          if (!open) setEdit(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply this category?</DialogTitle>
            <DialogDescription>
              Set “{edit?.t.normalizedMerchant}” to{" "}
              {edit && categoryById[edit.category].label}. You can also use this
              category for matching merchants in this report.
            </DialogDescription>
          </DialogHeader>
          {edit?.t.duplicateOf && (
            <p className="info-box">
              This may overlap another statement. Choose Duplicate only if it is
              the same bank transaction.
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => edit && void update([edit.t.id], edit.category)}
            >
              Just this transaction
            </Button>
            <Button
              disabled={busy || edit?.category === "duplicate"}
              onClick={() =>
                edit && void update([edit.t.id], edit.category, true)
              }
            >
              Matching merchants
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!split}
        onOpenChange={(open) => {
          if (!open) setSplit(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Separate principal and interest</DialogTitle>
            <DialogDescription>
              Use the interest amount from your loan statement. We will subtract
              it from the {split && money(split.amount)} payment and exclude the
              remaining principal. No amount is estimated.
            </DialogDescription>
          </DialogHeader>
          <label className="field">
            Interest paid (USD)
            <input
              type="text"
              inputMode="decimal"
              value={interest}
              onChange={(e) => setInterest(e.target.value)}
              placeholder="0.00"
            />
          </label>
          <DialogFooter>
            <Button
              disabled={busy || !interest}
              onClick={() => void splitLoan()}
            >
              Save split
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
