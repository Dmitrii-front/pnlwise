# Clearledger

Bank statements → review → deterministic P&L preview → one-time Stripe payment → PDF, XLSX, and CSV.

## Run locally

Node 22.13+ is required.

```sh
npm install
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_kind_morlun.sql
npm run dev
```

Apply later `drizzle/*.sql` migrations in order, once per database. The local server defaults to `http://127.0.0.1:5173`.

```sh
npm run typecheck
npm test
npm run test:e2e
```

Browser tests use an installed Google Chrome. `tests/fixtures/business.csv` contains synthetic data. Test outputs and browser screenshots are ignored under `outputs/` and `test-results/`.

## Stack and boundaries

- React, TypeScript, Next.js App Router APIs via Vinext, Tailwind, and shadcn primitives.
- Cloudflare Worker + D1 through Sites. This uses the workspace's supported hosting stack rather than requiring PostgreSQL/Supabase credentials for the initial preview. Supabase is an optional authentication provider.
- Source files are processed in memory and discarded at the end of each upload request. There is no raw-file storage bucket and no public upload URL.
- Normalized statements, transactions, rules, and report details live in one private versioned report document in D1. Payment records and analytics events have separate tables. Optimistic revisions reject concurrent stale writes.
- Files are capped at 10 MB each, 24 statements and 5,000 transactions per report, and 1.8 MB of normalized report JSON to stay below D1 row limits. Oversized reports receive a split-period instruction.
- Financial amounts are integer cents. AI cannot set amounts, dates, directions, totals, report ownership, or payment status.

## Product and legal configuration

`lib/config.ts` is the single source of public defaults. `.env.example` lists build-time `NEXT_PUBLIC_*` overrides and server-only settings. Change service name, operator, support address, site URL, price, retention days, and confidence thresholds there. Rebuild after changing public settings so visible prices and server checkout amounts remain identical.

Working values: **Clearledger**, operator **Clearledger**, **support@example.invalid**. These are not a claim that the domain or mailbox is registered. Replace the working identity and verify the mailbox before public launch.

`LEGAL_OPERATOR_NAME` and `SUPPORT_EMAIL` optionally override the legal-page defaults at runtime. Secrets must never use the `NEXT_PUBLIC_` prefix, enter Git, or appear in client code.

## Parsing and review

- CSV: quoted fields, detected headers, debit/credit or signed amounts, manual mapping, and explicit sign convention. Dates are ISO or US month/day/year. Amounts are validated before parsing; malformed rows fail the entire file with row numbers.
- XLSX: one transaction sheet, typed Excel dates, ZIP expansion/complexity checks. Workbooks with formulas, macros, external links, or multiple data sheets request a CSV export.
- PDF: text extraction with coordinate-based line reconstruction. The parser supports full dates with explicitly signed amounts or CR/DR suffixes, plus tables with distinct labeled Debit and Credit columns. Scanned files, encrypted/damaged PDFs, missing directions, ambiguous layout, and partial extraction are rejected with a CSV/XLSX alternative. **No OCR or claim of universal bank support.** Validate against real target-bank exports before marketing broad PDF compatibility.
- Identical file hashes are idempotently ignored. Possible transaction overlaps across statements require confirmation and are not silently removed. Known distinct account labels prevent false duplicate matches.
- Transfer pairing requires distinct specified accounts, matching amounts, opposite directions, nearby dates, and transfer descriptions. Ambiguous transfers remain under review.
- Refunds use the original income/expense category to offset it. Unknown refund treatment cannot be confirmed as a generic exclusion.
- Loan proceeds and principal stay out of P&L. An explicit user-entered interest amount can split a repayment; principal + interest preserves the original payment exactly.

## Integrations (off until configured)

### Stripe

Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `APP_ORIGIN` to the exact trusted HTTPS origin. Set up `/api/stripe/webhook` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`. The public production origin must permit external webhook delivery; owner-private preview access is not a public webhook endpoint.

Checkout amount and currency are server-controlled. Webhooks validate the raw-body HMAC, timestamp, stored session ID, report ID, payment ID, amount, currency, and paid status. Duplicate events are idempotent. Exports require ownership, verified paid status, a generated report, and no outstanding review items. A success URL is never accepted as proof of payment. No local/demo payment bypass exists in application routes.

Use Stripe test mode and Stripe CLI to validate real Checkout and webhook delivery before enabling live payments. No live credentials or charges are needed for this preview.
The current MVP runtime rejects live Stripe secret keys and signed events with `livemode: true`; enabling Live Mode requires an explicit code and configuration change after Test Mode QA.

### OpenAI categorization

Set `OPENAI_API_KEY` and `OPENAI_MODEL` to an available Structured Outputs-capable model. The Responses API uses a strict JSON schema, `store: false`, explicit category and transaction-type enums, a Zod response validator, and exact transaction ID matching. Unknown and medium-confidence non-exclusion rows are sent in bounded batches; descriptions are truncated and long numeric sequences are redacted. AI exclusions and incoming credits of $5,000 or more remain in Review regardless of model confidence. This is data minimization, not comprehensive PII removal. Confirm the provider's applicable data controls before commercial use.

Run `npm run test:ai-qa` with those environment variables to evaluate the mixed CSV/XLSX/PDF fixture. It reports the rules-only and AI Review counts, incorrect classifications, abstentions, and threshold results without printing the API key.

AI failure preserves extracted data and falls back to manual review. Large incoming AI-classified payments remain below the review threshold. Rules-only processing works with no API key.

### Optional accounts

Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. Configure Supabase Auth for email magic links and Google, allow the exact `/auth/confirm` callback URL, and configure reliable email delivery. The Supabase SSR client uses PKCE and HttpOnly cookies. `/auth/confirm` exchanges the code and verifies the user with `getUser()` before attaching session resources to that account. Every report read/write validates either the anonymous session or the verified account ID. No password flow or signup wall is added.

This optional integration cannot be end-to-end verified without a configured Auth project; its controls are hidden while unconfigured. Account linking does not extend report retention. Sign-out removes anonymous access from that browser. Data deletion removes accessible report documents; the provider account itself is not deleted.

### Analytics and monitoring

Funnel events are persisted server-side in D1 `events`. Client-supplied metadata is allowlisted; no raw descriptions, filenames, financial amounts, or business names enter analytics. Error events store error class names only. See `lib/server.ts` for the scrubbed server error boundary.

Configure production alerting against Worker errors/event counts before launch. Provider dashboard access and third-party alerts are not configured in this preview.

## Data retention and security

- HttpOnly, SameSite session cookies; Secure in production.
- Random 256-bit-class session tokens; only their hashes are stored as ownership identifiers.
- Same-origin mutation checks, prepared statements, private/no-store API responses, and server-side export authorization.
- Raw statements are discarded immediately after reading, including failed requests.
- Anonymous and linked report access expires after the configured period (30 days by default).
- Expired records are deleted in bounded batches on report creation. For timely deletion during idle periods, schedule an authenticated POST to `/api/maintenance` using `MAINTENANCE_SECRET`. Analytics older than 90 days and expired rate-limit buckets are cleaned there too.
- Delete My Data removes reports, normalized transactions, statements, and merchant rules in the current session and linked account. Minimal payment records remain separate.
- Deletion does not promise instantaneous erasure of infrastructure backups. Provider backup policies and the final legal retention policy need review before launch.

## Remaining production activation

1. Verify the service name/domain/support mailbox; review legal terms for the operator and jurisdiction.
2. Choose public production hosting/access and update the central canonical origin. Private preview publication does not expose anonymous public access or SEO indexing.
3. Configure and test Stripe test mode → webhook delivery → paid downloads → live mode.
4. Configure optional OpenAI and Supabase Auth; test real providers before describing them as live.
5. Schedule retention cleanup and error alerts; perform real-bank parsing QA and a security review.
6. Register Google Search Console and Bing Webmaster Tools after public deployment.

The preview is a runnable implementation, not a claim of commercial launch readiness or universal PDF parsing accuracy.

## Primary implementation references

- [Stripe Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment)
- [Stripe webhook signatures](https://docs.stripe.com/webhooks)
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Supabase server-side auth](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [unpdf](https://github.com/unjs/unpdf)
- [ExcelJS](https://github.com/exceljs/exceljs)
