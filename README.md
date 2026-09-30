# Shtepiaku AI — KOSICT Edition

An office-care adviser and price estimator. Visitors describe their workspace, get a tailored plan with an indicative monthly range, adjust it, and request an offer or an office visit. Staff review requests in a protected dashboard.

## Run

```bash
npm install
cp .env.example .env      # set STAFF_PASSWORD and SESSION_SECRET
npm run dev               # web on :5173, API on :8787
npm test                  # engine, rules, API and UI tests
npm run build && npm start   # production: one server on $PORT serving the app and API
```

Routes: `/` welcome · `/plan/1–6` questionnaire · `/rezultati` plan and price · `/kerkese` request · `/staff` staff dashboard.

Booth mode (shared tablets): open `/?booth=1` once on the device, or switch it on from the staff dashboard. `/?booth=0` turns it off.

## How it is put together

| Concern | Where |
| --- | --- |
| Pricing configuration (DEMO) | `shared/pricing/demo.ts` |
| Which configuration may be used | `shared/pricing/registry.ts` |
| Calculations | `shared/pricing/engine.ts` |
| Service eligibility and recommendations | `shared/rules.ts`, `shared/plans.ts` |
| Approved service descriptions | `shared/catalog.ts` |
| Deterministic explanation | `shared/explain.ts` |
| AI explanation (server-side, validated) | `server/ai.ts` |
| API, validation, spam and duplicate handling | `server/app.ts`, `shared/schema.ts` |
| Lead storage (real and demo in separate tables) | `server/store.ts` (contract), `server/supabase-store.ts` (hosted), `server/db.ts` (local SQLite) |
| Netlify function and routing | `netlify/functions/api.mts`, `netlify.toml` |

The engine runs in the browser for instant recalculation and again on the server when a request is submitted; stored estimates always come from the server.

## Prices: demo until tariffs are approved

No real Shtepiaku tariffs have been supplied. `DEMO_PRICING` holds placeholder figures, every screen using it shows “Çmime demonstruese”, and leads created with it go to the `demo_leads` table.

To go live:

1. Add an approved configuration (same shape as `DEMO_PRICING`, `status: 'approved'`).
2. Set `APPROVED_PRICING` to it in `shared/pricing/registry.ts`.
3. Run with `PRICING_MODE=live`.

With `PRICING_MODE=live` and no approved configuration, the app still builds plans and accepts requests but shows no prices.

## AI

Set `GROQ_API_KEY` to enable AI-written explanations through Groq (`GROQ_MODEL`, default `openai/gpt-oss-120b`). The key is used only by the server. The model gets the workspace profile, the plan scope and the approved service descriptions — no prices, company name or contact details — and its output is rejected if it mentions money, savings, guarantees or numbers the visitor did not give. Without a key, or on any failure, the deterministic explanation is shown.

## Staff and data

- `/api/staff/*` requires a signed, HttpOnly session cookie. There is no default password; without `STAFF_PASSWORD` the dashboard is disabled.
- Contact details are kept in memory only, never in browser storage. Outside booth mode, non-contact answers survive a refresh through `sessionStorage`; in booth mode nothing is stored locally.
- Spam protection: honeypot field, minimum fill time, per-IP rate limits. Retries reuse an idempotency key, and identical requests within 10 minutes are de-duplicated.
- With `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set, leads are stored in Supabase; otherwise locally in `DATA_DIR/leads.sqlite`.

## Deploy: Supabase + Netlify

1. **Supabase** — create a project. In **SQL Editor**, run `supabase/migrations/0001_leads.sql`. It creates `leads` and `demo_leads` with row-level security on and no public policies, so the anon key cannot read or write leads.
2. From **Project Settings → API**, copy the **Project URL** and the **service_role** key.
3. **Netlify** — import the GitHub repo. `netlify.toml` sets the build command, publish folder, Node version and the `/api/*` routing, so leave the build settings in the UI empty (or matching).
4. In **Site configuration → Environment variables**, add:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STAFF_PASSWORD`, `SESSION_SECRET` (`openssl rand -hex 32`), `GROQ_API_KEY`, `GROQ_MODEL=openai/gpt-oss-120b`, `PRICING_MODE=demo`. (`PORT` and `DATA_DIR` are not used on Netlify.)
5. Deploy. The public link is `https://<site>.netlify.app`; the staff dashboard is at `/staff`.

Without the Supabase variables the hosted API answers `503 server_not_configured` rather than accepting requests it cannot store.

Rate limits are kept in memory per serverless instance, so on Netlify they are best-effort; idempotency keys and duplicate detection are enforced in the database.
