import { config } from "./config";
export type Group = "revenue" | "cogs" | "opex" | "interest" | "excluded";
export const categories = [
  ["sales", "Sales / Service Revenue", "revenue", "income"],
  ["other-income", "Other Business Income", "revenue", "income"],
  ["materials", "Materials", "cogs", "expense"],
  ["inventory", "Inventory / Purchases", "cogs", "expense"],
  ["subcontractors", "Subcontractors", "cogs", "expense"],
  ["direct-labor", "Direct Labor", "cogs", "expense"],
  ["shipping", "Shipping / Fulfillment", "cogs", "expense"],
  ["other-cogs", "Other COGS", "cogs", "expense"],
  ["advertising", "Advertising & Marketing", "opex", "expense"],
  ["payroll", "Payroll", "opex", "expense"],
  ["rent", "Rent", "opex", "expense"],
  ["software", "Software & Subscriptions", "opex", "expense"],
  ["utilities", "Utilities", "opex", "expense"],
  ["insurance", "Insurance", "opex", "expense"],
  ["professional", "Professional Services", "opex", "expense"],
  ["office", "Office Expenses", "opex", "expense"],
  ["travel", "Travel", "opex", "expense"],
  ["meals", "Meals", "opex", "expense"],
  ["vehicle", "Vehicle", "opex", "expense"],
  ["bank-fees", "Bank Fees", "opex", "expense"],
  ["merchant-fees", "Merchant Fees", "opex", "expense"],
  ["repairs", "Repairs & Maintenance", "opex", "expense"],
  ["taxes", "Taxes & Licenses", "opex", "expense"],
  ["interest", "Interest", "interest", "expense"],
  ["other-expense", "Other Expenses", "opex", "expense"],
  ["transfer", "Transfer", "excluded", "transfer"],
  ["loan-proceeds", "Loan Proceeds", "excluded", "loan_proceeds"],
  ["loan-principal", "Loan Principal", "excluded", "loan_principal"],
  [
    "owner-contribution",
    "Owner Contribution",
    "excluded",
    "owner_contribution",
  ],
  ["owner-draw", "Owner Draw", "excluded", "owner_draw"],
  ["personal", "Personal", "excluded", "personal"],
  ["refund", "Refund / Reversal — choose category", "excluded", "refund"],
  [
    "excluded-reversal",
    "Excluded Refund / Reversal",
    "excluded",
    "excluded_reversal",
  ],
  ["duplicate", "Duplicate", "excluded", "unknown"],
  ["unknown", "Uncategorized — review", "excluded", "unknown"],
].map(([id, label, group, type]) => ({
  id,
  label,
  group: group as Group,
  type,
}));
export const categoryById = Object.fromEntries(
  categories.map((c) => [c.id, c]),
);
export const businessTypes = [
  "Consulting",
  "Freelancer",
  "Construction / Contractor",
  "E-commerce",
  "Restaurant / Food",
  "Real Estate",
  "Professional Services",
  "Retail",
  "Transportation",
  "Healthcare",
  "Other",
];
export const confidenceThresholds = {
  high: config.highConfidence,
  review: config.reviewConfidence,
};
export interface Transaction {
  id: string;
  statementId: string;
  date: string;
  rawDescription: string;
  normalizedMerchant: string;
  amount: number;
  currency: "USD";
  direction: "credit" | "debit";
  categoryId: string;
  confidence: number;
  transactionType: string;
  isTransfer: boolean;
  isPersonal: boolean;
  isDuplicate: boolean;
  userConfirmed: boolean;
  aiReason: string;
  createdAt: string;
  updatedAt: string;
  duplicateOf?: string;
}
export interface Statement {
  id: string;
  name: string;
  hash: string;
  format: string;
  rows: number;
  account: string;
  status: string;
  headers?: string[];
  error?: string;
}
export interface Report {
  id: string;
  businessName: string;
  businessType: string;
  periodStart: string;
  periodEnd: string;
  transactions: Transaction[];
  statements: Statement[];
  status: string;
  stage: number;
  aiCursor?: number;
  paid: boolean;
  revision: number;
  createdAt: string;
  isSample?: boolean;
  warnings: string[];
  rules: Record<string, string>;
}
export function needsReview(t: Transaction) {
  return (
    t.categoryId === "refund" ||
    (!t.userConfirmed &&
      (t.confidence < confidenceThresholds.high ||
        t.categoryId === "unknown" ||
        !!t.duplicateOf))
  );
}
export function setCategory(
  t: Transaction,
  id: string,
  confirmed = true,
): Transaction {
  const c = categoryById[id];
  if (!c) throw Error("Choose a valid category.");
  if (id === "refund" && confirmed)
    throw Error(
      "Choose the original income or expense category, or explicitly exclude this reversal.",
    );
  return {
    ...t,
    categoryId: id,
    transactionType: c.type,
    isTransfer: id === "transfer",
    isPersonal: id === "personal",
    isDuplicate: id === "duplicate",
    userConfirmed: confirmed,
    updatedAt: new Date().toISOString(),
  };
}
export function normalizeMerchant(s: string) {
  return (
    s
      .replace(
        /\b(POS|DEBIT CARD|CHECKCARD|PURCHASE|ACH|ONLINE|PAYMENT)\b/gi,
        " ",
      )
      .replace(/\b\d{4,}\b/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 90) || s.slice(0, 90)
  );
}
export function classify(t: Transaction): Transaction {
  const s = t.rawDescription.toLowerCase();
  let id = "unknown",
    confidence = 0.35,
    reason = "Confirm whether this is business activity and choose a category.";
  const exclusions: [RegExp, string, string][] = [
    [
      /owner.*(contribution|deposit)|capital contribution/,
      "owner-contribution",
      "Owner funding is excluded from revenue.",
    ],
    [
      /owner.*(draw|distribution)/,
      "owner-draw",
      "Owner withdrawals are excluded from expenses.",
    ],
    [
      /loan|lending|financing|sba deposit/,
      t.direction === "credit" ? "loan-proceeds" : "loan-principal",
      "Loan principal is excluded. Confirm the principal and interest amounts; no split has been invented.",
    ],
    [
      /transfer|xfer|credit card payment/,
      "transfer",
      "Possible transfer. Confirm that both sides belong to your business.",
    ],
    [
      /refund|reversal|chargeback/,
      "refund",
      "Apply the original income or expense category to offset that amount, or confirm exclusion.",
    ],
  ];
  for (const [re, c, r] of exclusions)
    if (re.test(s)) {
      return { ...setCategory(t, c, false), confidence: 0.6, aiReason: r };
    }
  const rules: [RegExp, string, string][] = [
    [
      /amazon web services|amzn aws|\baws\b|adobe|figma|notion|github|microsoft 365|google workspace|slack|zoom/,
      "software",
      "Subscription or software merchant.",
    ],
    [
      /google ads|meta ads|facebook ads|advertising/,
      "advertising",
      "Advertising merchant.",
    ],
    [
      /monthly.*fee|maintenance fee|overdraft|wire fee/,
      "bank-fees",
      "Bank service charge.",
    ],
    [/insurance|geico|progressive/, "insurance", "Insurance payment."],
    [/office rent|coworking|wework/, "rent", "Business premises payment."],
    [
      /electric|internet|comcast|verizon|utility/,
      "utilities",
      "Utility provider; confirm business use.",
    ],
    [
      /restaurant|cafe|coffee|doordash|uber eats/,
      "meals",
      "Food purchase; confirm business use.",
    ],
    [
      /shell|chevron|exxon|gas station/,
      "vehicle",
      "Vehicle cost; confirm business use.",
    ],
    [
      /interest charge|interest payment/,
      "interest",
      "Explicit interest charge.",
    ],
    [
      /client payment|invoice.*paid|service revenue|sales receipt/,
      "sales",
      "Description identifies a customer payment.",
    ],
  ];
  for (const [re, c, r] of rules)
    if (re.test(s)) {
      id = c;
      confidence = ["meals", "vehicle", "utilities"].includes(c) ? 0.72 : 0.92;
      reason = r;
      break;
    }
  if (t.direction === "credit" && id !== "unknown" && id !== "sales") {
    confidence = 0.6;
    reason = "Possible refund. Confirm the original expense category.";
  }
  if (t.direction === "debit" && id === "sales") {
    confidence = 0.6;
    reason = "Possible customer refund. Confirm that this offsets revenue.";
  }
  if (t.direction === "credit" && t.amount >= 500000 && id === "unknown")
    reason =
      "Large incoming payment: verify whether this is revenue, a loan, a transfer, or owner funding.";
  return {
    ...setCategory(t, id, false),
    normalizedMerchant: normalizeMerchant(t.rawDescription),
    confidence,
    aiReason: reason,
  };
}
export function detectDuplicates(ts: Transaction[], statements: Statement[]) {
  const accounts = new Map(statements.map((s) => [s.id, s.account]));
  const seen = new Map<string, Transaction[]>();
  return ts.map((t) => {
    const account = accounts.get(t.statementId) || "";
    const k = `${t.date}|${t.amount}|${t.direction}|${t.rawDescription.toLowerCase().trim()}`;
    const matches = seen.get(k) || [];
    const previous = matches.find(
      (p) =>
        p.statementId === t.statementId ||
        !account ||
        !accounts.get(p.statementId) ||
        account === accounts.get(p.statementId),
    );
    matches.push(t);
    seen.set(k, matches);
    return previous
      ? {
          ...t,
          duplicateOf: previous.id,
          confidence: 0.5,
          aiReason:
            "Possible duplicate transaction. Confirm duplicate or keep this transaction.",
        }
      : t;
  });
}
export function detectTransfers(ts: Transaction[], statements: Statement[]) {
  const result = ts.map((t) => ({ ...t }));
  const accounts = new Map(statements.map((s) => [s.id, s.account]));
  const matched = new Set<string>();
  for (let i = 0; i < result.length; i++) {
    const t = result[i];
    if (
      matched.has(t.id) ||
      t.duplicateOf ||
      !/(transfer|xfer)/i.test(t.rawDescription)
    )
      continue;
    const candidates = result.filter(
      (u) =>
        u.id !== t.id &&
        !matched.has(u.id) &&
        !u.duplicateOf &&
        u.statementId !== t.statementId &&
        accounts.get(u.statementId) &&
        accounts.get(t.statementId) &&
        accounts.get(u.statementId) !== accounts.get(t.statementId) &&
        u.amount === t.amount &&
        u.direction !== t.direction &&
        Math.abs(Date.parse(u.date) - Date.parse(t.date)) <= 3 * 86400000 &&
        /(transfer|xfer)/i.test(u.rawDescription),
    );
    if (candidates.length === 1) {
      for (const a of [t, candidates[0]]) {
        Object.assign(a, setCategory(a, "transfer", false), {
          confidence: 0.94,
          aiReason:
            "Matching opposite transfer between two specified accounts within three days.",
        });
        matched.add(a.id);
      }
    }
  }
  return result;
}
export function calculatePnl(
  transactions: Transaction[],
  start: string,
  end: string,
) {
  if (!validDate(start) || !validDate(end) || start > end)
    throw Error("Choose a valid reporting period.");
  const totals: Record<string, number> = {};
  let excluded = 0,
    excludedCount = 0,
    inPeriod = 0;
  for (const t of transactions) {
    if (
      !Number.isSafeInteger(t.amount) ||
      t.amount < 0 ||
      !validDate(t.date) ||
      t.currency !== "USD" ||
      !categoryById[t.categoryId]
    )
      throw Error(
        "Invalid transaction data. Review your statement before generating.",
      );
    if (t.date < start || t.date > end) continue;
    inPeriod++;
    const c = categoryById[t.categoryId];
    if (c.group === "excluded" || t.isDuplicate) {
      excluded += t.amount;
      excludedCount++;
      continue;
    }
    const signed = (t.direction === "credit" ? 1 : -1) * t.amount;
    totals[c.id] =
      (totals[c.id] || 0) + (c.group === "revenue" ? signed : -signed);
    if (!Number.isSafeInteger(totals[c.id]))
      throw Error("Report exceeds supported amount range.");
  }
  const sum = (g: Group) =>
    categories
      .filter((c) => c.group === g)
      .reduce((n, c) => n + (totals[c.id] || 0), 0);
  const revenue = sum("revenue"),
    cogs = sum("cogs"),
    opex = sum("opex"),
    interest = sum("interest"),
    grossProfit = revenue - cogs,
    operatingProfit = grossProfit - opex,
    netProfit = operatingProfit - interest;
  for (const n of [
    revenue,
    cogs,
    opex,
    interest,
    grossProfit,
    operatingProfit,
    netProfit,
  ])
    if (!Number.isSafeInteger(n))
      throw Error("Report exceeds supported amount range.");
  return {
    totals,
    revenue,
    cogs,
    opex,
    interest,
    grossProfit,
    operatingProfit,
    netProfit,
    totalExpenses: cogs + opex + interest,
    grossMargin: revenue ? grossProfit / revenue : null,
    netMargin: revenue ? netProfit / revenue : null,
    excluded,
    excludedCount,
    inPeriod,
  };
}
export function validDate(s: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !isNaN(Date.parse(s)) &&
    new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s
  );
}
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
export const percent = (n: number | null) =>
  n === null ? "—" : `${(n * 100).toFixed(1)}%`;
export function sampleReport(): Report {
  const rows: [string, string, number, string][] = [
    ["2026-01-05", "Client payment — brand project", 1850000, "sales"],
    ["2026-02-10", "Client payment — design retainer", 1540000, "sales"],
    ["2026-03-05", "Client payment — website", 1435000, "sales"],
    ["2026-01-12", "Production materials", 240000, "materials"],
    ["2026-02-18", "Freelance production partner", 400000, "subcontractors"],
    ["2026-01-15", "Adobe Creative Cloud", 42000, "software"],
    ["2026-02-15", "Figma", 42000, "software"],
    ["2026-03-15", "Notion", 40000, "software"],
    ["2026-01-20", "Google Ads", 180000, "advertising"],
    ["2026-02-20", "Meta Ads", 180000, "advertising"],
    ["2026-01-01", "Office rent — quarter", 600000, "rent"],
    ["2026-02-01", "Business insurance", 144000, "insurance"],
    ["2026-03-20", "Office supplies", 40000, "office"],
  ];
  return {
    id: "sample",
    businessName: "Studio North, LLC",
    businessType: "Professional Services",
    periodStart: "2026-01-01",
    periodEnd: "2026-03-31",
    status: "ready",
    stage: 6,
    paid: false,
    revision: 0,
    createdAt: "2026-04-01",
    isSample: true,
    warnings: [],
    rules: {},
    statements: [],
    transactions: rows.map(([date, rawDescription, amount, categoryId], i) => ({
      id: `sample-${i}`,
      statementId: "sample",
      date,
      rawDescription,
      normalizedMerchant: rawDescription,
      amount,
      categoryId,
      currency: "USD",
      direction: categoryId === "sales" ? "credit" : "debit",
      confidence: 0.98,
      transactionType: categoryId === "sales" ? "income" : "expense",
      isTransfer: false,
      isPersonal: false,
      isDuplicate: false,
      userConfirmed: true,
      aiReason: "Illustrative sample data.",
      createdAt: date,
      updatedAt: date,
    })),
  };
}
