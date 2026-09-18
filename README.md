# Pnlwise

Bank statements → review → deterministic P&L preview → one-time Paddle Sandbox payment → PDF, XLSX, and CSV.

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

`lib/config.ts` is the single source of public product defaults. `.env.example` lists build-time `NEXT_PUBLIC_*` overrides and server-only settings. Change service name, site URL, price, retention days, and confidence thresholds there. Rebuild after changing public settings so visible prices and server checkout amounts remain identical.

`LEGAL_OPERATOR_NAME` and `SUPPORT_EMAIL` are required runtime settings for payment-enabled environments. They must identify the verified service operator and a monitored support mailbox. Missing or invalid values disable checkout and legal pages show a noncommercial configuration notice. Secrets must never use the `NEXT_PUBLIC_` prefix, enter Git, or appear in client code.

## Parsing and review

- CSV: quoted fields, detected headers, debit/credit or signed amounts, manual mapping, and explicit sign convention. Dates are ISO or US month/day/year. Amounts are validated before parsing; malformed rows fail the entire file with row numbers.
- XLSX: one transaction sheet, typed Excel dates, ZIP expansion/complexity checks. Workbooks with formulas, macros, external links, or multiple data sheets request a CSV export.
- PDF: text extraction with coordinate-based line reconstruction. The parser supports full dates with explicitly signed amounts or CR/DR suffixes, plus tables with distinct labeled Debit and Credit columns. Scanned files, encrypted/damaged PDFs, missing directions, ambiguous layout, and partial extraction are rejected with a CSV/XLSX alternative. **No OCR or claim of universal bank support.** Validate against real target-bank exports before marketing broad PDF compatibility.
- Identical file hashes are idempotently ignored. Possible transaction overlaps across statements require confirmation and are not silently removed. Known distinct account labels prevent false duplicate matches.
- Transfer pairing requires distinct specified accounts, matching amounts, opposite directions, nearby dates, and transfer descriptions. Ambiguous transfers remain under review.
- Refunds use the original income/expense category to offset it. Unknown refund treatment cannot be confirmed as a generic exclusion.
- Loan proceeds and principal stay out of P&L. An explicit user-entered interest amount can split a repayment; principal + interest preserves the original payment exactly.

## Integrations (off until configured)

### Paddle Sandbox

Set `PADDLE_API_KEY`, `PADDLE_NOTIFICATION_WEBHOOK_SECRET`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, and `APP_ORIGIN`. The API key must start with `pdl_sdbx_apikey_`, the client token with `test_`, and the Paddle SDK is hard-coded to Sandbox. Optional `PADDLE_ENVIRONMENT` and `NEXT_PUBLIC_PADDLE_ENV` values may only be `sandbox`. Live credentials and environment values fail closed. Configure a Sandbox notification destination for `${APP_ORIGIN}/api/paddle/webhook` subscribed to `transaction.completed`. The public origin must permit external webhook delivery; owner-private preview access is not a public webhook endpoint.

Checkout creates a server-side transaction for the fixed Sandbox price and passes only its transaction ID to Paddle.js. The catalog price restricts quantity to exactly one. Webhooks use the official Paddle SDK against the raw request body, then validate `transaction.completed`, a captured payment attempt, stored transaction ID, report ID, payment ID, product, price, one-time billing shape, quantity, amount, currency, and zero discount. Duplicate events are idempotent. Exports require ownership, verified paid status, a generated report, and no outstanding review items. A success URL or client event is never accepted as proof of payment.

Set the Sandbox default payment link to `${APP_ORIGIN}/checkout`, then validate checkout and webhook delivery using Paddle Sandbox test cards and the Sandbox notification destination. No live credentials or charges are used.

### Legacy Stripe rollback path

The prior Stripe Test Mode implementation and `/api/stripe/webhook` remain in the codebase for rollback until Paddle Sandbox E2E is complete. It is not reachable from the active checkout UI or checkout API.

### OpenAI categorization

Set `OPENAI_API_KEY` and `OPENAI_MODEL` to an available Structured Outputs-capable model. The Responses API uses a strict JSON schema, `store: false`, explicit category and transaction-type enums, a Zod response validator, and exact transaction ID matching. Unknown and medium-confidence non-exclusion rows are sent in bounded batches; descriptions are truncated and long numeric sequences are redacted. AI exclusions and incoming credits of $5,000 or more remain in Review regardless of model confidence. This is data minimization, not comprehensive PII removal. Confirm the provider's applicable data controls before commercial use.

Run `npm run test:ai-qa` with those environment variables to evaluate the mixed CSV/XLSX/PDF fixture. It reports the rules-only and AI Review counts, incorrect classifications, abstentions, and threshold results without printing the API key.

AI failure preserves extracted data and falls back to manual review. Large incoming AI-classified payments remain below the review threshold. Rules-only processing works with no API key.

### Optional accounts

Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. Configure Supabase Auth for email magic links and Google, allow the exact `/auth/confirm` callback URL, and configure reliable email delivery. The Supabase SSR client uses PKCE and HttpOnly cookies. `/auth/confirm` exchanges the code and verifies the user with `getUser()` before attaching session resources to that account. Every report read/write validates either the anonymous session or the verified account ID. No password flow or signup wall is added.

This optional integration cannot be end-to-end verified without a configured Auth project; its controls are hidden while unconfigured. Account linking does not extend report retention. Sign-out removes anonymous access from that browser. Data deletion removes accessible report documents; the provider account itself is not deleted.

### Analytics and monitoring

Funnel events are persisted server-side in D1 `events`. Client-supplied metadata is allowlisted; no raw descriptions, filenames, financial amounts, or business names enter analytics. Error events store error class names only. See `lib/server.ts` for the scrubbed server error boundary.

Server-side operational failures are sent to Sentry only when marked `alertable`. Events contain stable error, subsystem, route, stage, retryability, environment, and optional validated provider-request identifiers. They omit request bodies, cookies, authorization data, report contents, financial values, customer data, breadcrumbs, and user context. Configure `SENTRY_DSN` as a server secret and `SENTRY_ENVIRONMENT` as a non-secret deployment label. The authenticated staging-only `/api/monitoring/proof` route can verify ingestion without customer data. Configure a Sentry issue alert filtered to `alertable:true` for email or the chosen on-call channel before launch.

## Data retention and security

- HttpOnly, SameSite session cookies; Secure in production.
- Random 256-bit-class session tokens; only their hashes are stored as ownership identifiers.
- Same-origin mutation checks, prepared statements, private/no-store API responses, and server-side export authorization.
- Raw statements are discarded immediately after reading, including failed requests.
- Anonymous and linked report access expires after the configured period (30 days by default).
- Expired records are deleted in bounded batches on report creation. For timely deletion during idle periods, schedule an authenticated POST to `/api/maintenance` using `MAINTENANCE_SECRET`. Ordinary analytics older than 90 days and expired rate-limit buckets are cleaned there too; payment completion audit events are preserved.
- Delete My Data removes reports, normalized transactions, statements, and merchant rules in the current session and linked account. Minimal payment records remain separate.
- Deletion does not promise instantaneous erasure of infrastructure backups. Provider backup policies and the final legal retention policy need review before launch.

## Remaining production activation

1. Verify the service name/domain/support mailbox; review legal terms for the operator and jurisdiction.
2. Choose public production hosting/access and update the central canonical origin. Private preview publication does not expose anonymous public access or SEO indexing.
3. Configure and test Paddle Sandbox checkout → `transaction.completed` webhook delivery → paid downloads. Live Paddle remains disabled.
4. Configure optional OpenAI and Supabase Auth; test real providers before describing them as live.
5. Schedule retention cleanup and error alerts; perform real-bank parsing QA and a security review.
6. Register Google Search Console and Bing Webmaster Tools after public deployment.

The preview is a runnable implementation, not a claim of commercial launch readiness or universal PDF parsing accuracy.

## Primary implementation references

- [Paddle Checkout](https://developer.paddle.com/build/checkout/build-overlay-checkout)
- [Paddle webhook signatures](https://developer.paddle.com/webhooks/signature-verification)
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Supabase server-side auth](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [unpdf](https://github.com/unjs/unpdf)
- [ExcelJS](https://github.com/exceljs/exceljs)
