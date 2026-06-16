# NeuroBuilds — Deployment Guide

NeuroBuilds is not a single deployable. It is **four pieces** that ship independently:

| # | Piece | Tech | Recommended target |
|---|-------|------|--------------------|
| 1 | Frontend SPA | Vite + React (static build) | Firebase Hosting (or Vercel/Netlify) |
| 2 | AI Backend | FastAPI + LangGraph (Python 3.11+) | Google Cloud Run (or Render/Railway) |
| 3 | WhatsApp OTP Gateway | Node + whatsapp-web.js (headless Chromium, **stateful**) | A small VPS or any host with a **persistent disk** — *not* serverless |
| 4 | Data layer config | Firestore rules/indexes + MongoDB Atlas indexes & data | Firebase CLI + Atlas UI / ingestion scripts |

Deploy in this order: **data layer → backend → gateway → frontend**, because each later piece needs URLs/credentials from the earlier ones.

---

## 0. Prerequisites

- Firebase project with **Auth** (Email/Password + Google), **Firestore**, and (for TOTP 2FA) **Multi-factor Auth** enabled in the console
- MongoDB Atlas cluster (M0 free tier works; Vector Search requires Atlas, not self-hosted Mongo)
- API keys: Gemini (`GEMINI_KEY_1..N` or `GOOGLE_API_KEY`), Tavily, YouTube Data v3, ImgBB, GNews
- CLIs: `firebase-tools` (`npm i -g firebase-tools`), and `gcloud` if using Cloud Run
- A Firebase **service-account JSON** (Console → Project Settings → Service Accounts → Generate new private key) for the backend's Admin SDK — *not needed on Cloud Run if you use Application Default Credentials (see §2)*

---

## 1. Data layer

### 1.1 Firestore rules & indexes

`firebase.json` currently only declares indexes. Add the rules file so it deploys too:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

Then:

```bash
firebase login
firebase use <your-project-id>        # creates .firebaserc
firebase deploy --only firestore      # deploys rules + composite indexes
```

The rules are load-bearing security (admin JWT claim checks, immutable `role`/`isVerified`/`phoneNumber` trust fields, verified-seller gate on `listings` create, append-only `audit_logs`). **Do not go live without deploying them** — the default test-mode rules leave every collection open.

### 1.2 MongoDB Atlas

1. Create the cluster and a database user; note the `mongodb+srv://` URI.
2. **Network access**: allow the backend host's egress IPs (Cloud Run/Render have dynamic IPs — either allow `0.0.0.0/0` with a strong password + TLS, or use a private peering/static-egress setup).
3. Create two **Atlas Vector Search indexes** in the Atlas UI (768 dims, cosine, on the `embedding` field):
   - `vector_index` on `neurobuilds.hardware_specs` (RAG retrieval)
   - `semantic_cache_index` on `neurobuilds.semantic_cache` (LLM semantic cache)
4. Populate data (run locally with `backend/.env` filled in):

```bash
cd backend
python scripts/ingest_rag_documents.py        # hardware_specs (RAG) — idempotent
python scripts/ingest_hardware.py             # hardware_catalog (/api/hardware/lookup)
```

Geo (`2dsphere`) and compound indexes for marketplace search are created automatically at backend startup via `location_search.ensure_indexes()`.

### 1.3 Bootstrap the first admin

Role management lives behind `require_admin`, which checks the JWT `admin` custom claim — so the very first admin must be promoted out-of-band:

```bash
cd backend
python promote_admin.py <uid>     # sets users/{uid}.role = 'admin' + the JWT claim
```

The promoted user must sign out and back in to pick up the new claim. All later role changes go through the Admin UI (`/admin` → Role Management).

---

## 2. FastAPI backend

### Option A — Google Cloud Run (recommended)

Cloud Run supports streaming responses (the `/api/chat` token stream), scales to zero, and lets you drop `FIREBASE_SERVICE_ACCOUNT_PATH` entirely — the Admin SDK picks up Application Default Credentials from the runtime service account.

Add `backend/Dockerfile`:

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Cloud Run injects $PORT (defaults to 8080)
CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}
```

Deploy:

```bash
cd backend
gcloud run deploy neurobuilds-ai \
  --source . \
  --region <region> \
  --allow-unauthenticated \
  --timeout 300 \
  --set-env-vars "GEMINI_KEY_1=...,GEMINI_MODEL=gemini-2.0-flash,TAVILY_API_KEY=...,YOUTUBE_API_KEY=...,MONGODB_ATLAS_URI=...,CORS_ORIGINS=https://<your-frontend-domain>,WHATSAPP_GATEWAY_URL=https://<gateway-host>,GATEWAY_SECRET=...,FIREBASE_PROJECT_ID=<project-id>"
```

Notes:
- Prefer **Secret Manager** (`--set-secrets`) over `--set-env-vars` for keys in anything beyond a demo.
- Grant the Cloud Run service account the **Firebase Admin / Service Account Token Creator** roles so ADC can verify tokens and set custom claims.
- `--timeout 300` covers long LLM streams; the pipeline streams `text/plain` with `X-Accel-Buffering: no` already set, so no proxy-buffering config is needed on Cloud Run.

### Option B — Render / Railway

- Root directory: `backend/`
- Build: `pip install -r requirements.txt`
- Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Upload the service-account JSON as a **secret file** and set `FIREBASE_SERVICE_ACCOUNT_PATH` to its mounted path.
- Set all the same env vars as above. Render's free tier sleeps; the frontend's 10 s timeout will hit the mock fallback while it cold-starts.

### Required env vars (production checklist)

From `backend/.env.example` — the deployment-critical ones:

| Var | Production value |
|-----|------------------|
| `GEMINI_KEY_1..N` / `GOOGLE_API_KEY` | Real keys (pool mode recommended) |
| `TAVILY_API_KEY`, `YOUTUBE_API_KEY` | Real keys |
| `MONGODB_ATLAS_URI` | Atlas SRV URI |
| `CORS_ORIGINS` | **Your deployed frontend origin(s)** — the default is localhost-only; forgetting this blocks every browser call |
| `FIREBASE_SERVICE_ACCOUNT_PATH` or ADC | See options above |
| `WHATSAPP_GATEWAY_URL` + `GATEWAY_SECRET` | Public gateway URL + long random secret (`openssl rand -hex 32`) |

Verify: `curl https://<backend-url>/health` → `{"status": "ok", "service": "neurobuilds-ai"}`.

---

## 3. WhatsApp OTP Gateway

This service is **stateful**: whatsapp-web.js runs headless Chromium and persists its WhatsApp session in `.wwebjs_auth/`. If that directory is lost, the linked device is dropped and someone must re-scan the QR code. Therefore:

- ❌ Cloud Run / Lambda / anything with an ephemeral filesystem
- ✅ A small VPS (cheapest droplet/EC2 works), Railway/Fly.io **with a mounted volume**, or simply keep it on a machine you control

Setup on a VPS:

```bash
cd backend/whatsapp-gateway
npm install                       # pulls Puppeteer's Chromium (needs the usual chromium deps on Linux)
GATEWAY_SECRET=<same-secret-as-backend> node index.js
# First run prints a QR code → WhatsApp → Settings → Linked Devices → Link a Device
```

Run it under a process manager so it survives reboots, e.g. `pm2 start index.js --name wa-gateway` + `pm2 save && pm2 startup`. Put it behind HTTPS (Caddy/nginx reverse proxy) if the FastAPI backend reaches it over the public internet, and **always set `GATEWAY_SECRET`** — unset means unauthenticated OTP sending.

Verify: `curl https://<gateway-host>/health` → `"status": "ready"`.

If you skip this service, the rest of the app still works — only seller phone verification (and therefore listing creation, which requires `isVerified`) is blocked.

---

## 4. Frontend

The frontend is a fully static Vite build — **all `VITE_*` vars are baked in at build time**, so set them in the hosting provider's build environment (or a local `.env.production`) *before* building:

```bash
# Firebase web config (6 vars — Console → Project Settings → Your apps)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...

VITE_AI_SERVICE_URL=https://<backend-url>     # no trailing slash; defaults to localhost:8000 if omitted!
VITE_IMGBB_API_KEY=...                        # marketplace image uploads
VITE_GNEWS_API_KEY=...                        # news fallback (optional)
VITE_YOUTUBE_API_KEY=...                      # video reviews (optional; see security note)
```

### Option A — Firebase Hosting (recommended — same console as Auth/Firestore)

```bash
firebase init hosting     # public dir: dist, single-page app: YES, no auto-builds needed
npm run build
firebase deploy --only hosting
```

`firebase init hosting` adds to `firebase.json`:

```json
"hosting": {
  "public": "dist",
  "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
  "rewrites": [{ "source": "**", "destination": "/index.html" }]
}
```

The SPA rewrite is **required** — React Router v7 uses client-side routes (`/marketplace`, `/share`, …) that 404 on static hosts without it. The PWA service worker (`vite-plugin-pwa`, `autoUpdate`) works out of the box on any static host.

### Option B — Vercel / Netlify

- Build command `npm run build`, output dir `dist`, set the `VITE_*` env vars in the dashboard.
- Add the SPA fallback: Vercel — `vercel.json` with a rewrite of `(.*)` → `/index.html`; Netlify — `_redirects` file with `/* /index.html 200`.

### Post-deploy Firebase console steps

1. **Auth → Settings → Authorized domains**: add the production domain, or Google OAuth sign-in will fail.
2. Confirm Multi-factor Auth is enabled if you want TOTP 2FA to work.

---

## 5. Smoke test

1. Open the site → HomePage loads with live Firestore stats (rules + indexes OK).
2. Register, sign in with Google (authorized domain OK).
3. `/chat` → send a message → **streamed** AI response, not the instant mock text (backend URL + CORS OK). The mock fallback kicks in silently if the backend is unreachable — a fast canned response is the symptom.
4. Profile → seller verification → receive a WhatsApp OTP (gateway OK).
5. Create a listing with images (ImgBB key + verified-seller rules OK).
6. Sign in as the promoted admin → `/admin` loads all six tabs (custom claim OK).

---

## 6. Production caveats (known, pre-existing)

- **Bundle size**: the build emits a single ~991 kB JS chunk. Works, but consider route-based code splitting before chasing Lighthouse scores.
- **`VITE_YOUTUBE_API_KEY` is exposed client-side**: the backend proxy `GET /api/components/reviews` exists; wiring the frontend to it (instead of direct YouTube calls) removes the key from the bundle. Until then, restrict the key by HTTP referrer in the Google console.
- **Scheduled blog posts don't auto-publish**: no cron exists; `scheduled` posts need manual admin action (or add a Cloud Scheduler → backend endpoint later).
- **`/dev/seed`** is `import.meta.env.DEV`-guarded, so it is automatically excluded from production builds — nothing to do.
- **Semantic cache** silently no-ops if the `semantic_cache_index` is missing — the app works, just without LLM caching.
