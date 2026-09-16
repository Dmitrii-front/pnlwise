import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const reports = sqliteTable(
  "reports",
  {
    id: text("id").primaryKey(),
    sessionHash: text("session_hash").notNull(),
    userId: text("user_id"),
    data: text("data").notNull(),
    revision: integer("revision").notNull().default(0),
    paid: integer("paid").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [
    index("idx_reports_session").on(t.sessionHash),
    index("idx_reports_expiry").on(t.expiresAt),
  ],
);
export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id").notNull(),
    stripeSessionId: text("stripe_session_id").unique(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    paddleTransactionId: text("paddle_transaction_id").unique(),
    paddleEventId: text("paddle_event_id").unique(),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_payments_report").on(t.reportId)],
);
export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  metadata: text("metadata").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
