# NeuroBuilds

> An AI-assisted PC-hardware community platform — marketplace, forums, real-time chat, a blog CMS, and a deterministic-then-narrate AI build assistant.

NeuroBuilds is a University **Final Year Project (FYP)**: a full-stack web application for PC builders to buy and sell hardware, discuss builds, read AI-curated content, and design a complete, compatibility-checked PC with an AI assistant. It is built around a single architectural thesis — **keep the maths deterministic and let the LLM only narrate it** — so the assistant can explain a build in natural language while never being the thing that adds up a budget or decides whether a PSU is big enough.

---

## What's inside

| Area | Highlights |
|------|-----------|
| **Marketplace** | Firestore-backed classifieds with image upload, geo-aware location filtering, seller phone verification (WhatsApp OTP), 30-day auto-expiry, saved listings, and reporting/moderation |
| **Community** | Threaded forums with nested replies, transactional voting, and lifecycle states (open / solved / hidden) |
| **Real-time chat** | 1:1 DMs and group chats over Firestore `onSnapshot`; "Message Seller" deep-links from a listing |
| **Blog / CMS** | Admin authoring with a `draft → pending_review → published/scheduled` workflow, comments, and an **AI Blog Automator** (research → draft → self-critique loop → human review) |
| **AI build assistant** | A LangGraph pipeline that researches live prices, retrieves hardware specs (RAG), allocates a budget, runs a 13-tier compatibility check, and streams an educational explanation |
| **Admin workspace** | Review queue, moderation desk, analytics, weekly market-intelligence dashboard, role management, ads manager, and thesis-evaluation telemetry |
| **Ads** | Static and Firestore-backed sponsored slots interleaved into the home feed and marketplace grid |

---

## Architecture at a glance

NeuroBuilds is a frontend SPA plus several independently-run backend services.

```
┌──────────────────────────┐     ┌──────────────────────────────────────────┐
│  React + TypeScript SPA   │────▶│  FastAPI AI service (Python, LangGraph)   │
│  (Vite, Firebase client)  │     │  chat, market intel, moderation, admin    │
└─────────────┬────────────┘     └───────────────┬──────────────────────────┘
              │                                   │
              ▼                                   ▼
       ┌─────────────┐                 ┌────────────────────────┐
       │  Firebase   │                 │  MongoDB Atlas          │
       │  Auth +     │                 │  vector RAG, semantic   │
       │  Firestore  │                 │  cache, market_intel    │
       └─────────────┘                 └────────────────────────┘
                                                  │
       ┌──────────────────────────┐     ┌─────────┴──────────────┐
       │  WhatsApp OTP gateway     │     │  Gemini (single key)    │
       │  (Node, whatsapp-web.js)  │     │  + Groq fallback        │
       └──────────────────────────┘     └────────────────────────┘
```

### The deterministic / probabilistic split (core thesis)

The AI pipeline assigns every stage to exactly one layer, and a system prompt forbids the LLM from ever crossing the boundary:

| Layer | Node(s) | Responsibility |
|-------|---------|----------------|
| **A — LLM (semantic)** | `intent_node` | Parse natural language into a structured `BuildIntent`. No arithmetic. |
| **B — Code (deterministic)** | `selection_node` | Budget allocation, price breakdown, efficiency scoring. No LLM. |
| **C — Code (deterministic)** | `compatibility_node` | Socket match, PSU transient margin, RAM type, bottleneck, upgrade path. No LLM. |
| **D — LLM (narration)** | `response_node` | Turn the Layer B+C reports into prose. Forbidden from recalculating or contradicting them — *"a translator, not a calculator."* |

This makes the assistant's factual claims auditable: the numbers come from pure Python (`backend/services/selection_engine.py` + `validation_engine.py`), and the same engines are scored offline in `backend/tests/evaluation_suite.py` (precision/recall on compatibility, budget-allocation error).

---

## Tech stack

**Frontend** — React 19, TypeScript, Vite, React Router v7, Tailwind (cyberpunk/neon design system), `vite-plugin-pwa` (installable, offline-capable).

**Data & auth** — Firebase Auth (email/password + Google + GitHub), Cloud Firestore (all live user data, real-time via `onSnapshot`), security enforced by `firestore.rules` (JWT custom-claim admin checks, server-only trust fields).

**Backend (AI service)** — FastAPI + LangGraph, Google Gemini (single-key client with a circuit breaker) with an OpenAI-compatible fallback (Groq by default), Tavily web search, MongoDB Atlas Vector Search for RAG and an LLM semantic cache.

**Supporting services** — a standalone Node WhatsApp OTP gateway for seller verification. `misc/gemini-key-manager/` (a TS pooled key-rotation prototype) and `misc/blog-automator/` (the original TS blog pipeline, since migrated into the FastAPI backend) are kept for reference only and are not run in production.

---

## Repository layout

```
src/                      React SPA (components, hooks, contexts, pages, utils, services)
backend/                  FastAPI AI service
  agent.py                LangGraph pipeline (search → rag → market → intent → select → compat → respond)
  services/               deterministic engines, market intel, embeddings, vector store, caching
  routers/                admin, verify, components, market-intel, listings-maintenance endpoints
  whatsapp-gateway/       Node WhatsApp OTP microservice
  scripts/                hardware / RAG ingestion
  tests/evaluation_suite.py   offline accuracy evaluation (no network/DB)
misc/                     reference material not part of the running app (see below)
  blog-automator/         original TS blog pipeline, superseded by backend/routers/blog_automator.py
  gemini-key-manager/     standalone TS key-rotation/load-balancing prototype, never wired in
firestore.rules           Firestore security rules
firestore.indexes.json    composite index definitions
CLAUDE.md                 detailed architecture & contributor guide
```

---

## Getting started

### Prerequisites
- Node.js 18+ and Python 3.11+
- A Firebase project (Auth + Firestore)
- API keys as needed: Gemini, Tavily, MongoDB Atlas, ImgBB, GNews, YouTube Data API

### 1. Frontend
```bash
npm install
npm run dev        # http://localhost:5173 (Vite + HMR)
npm run build      # type-check + production build
npm run lint
```
Create a `.env` with the `VITE_*` variables (Firebase config, `VITE_AI_SERVICE_URL`, `VITE_IMGBB_API_KEY`, `VITE_GNEWS_API_KEY`, `VITE_YOUTUBE_API_KEY`).

### 2. Backend AI service
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env          # then fill in API keys
uvicorn main:app --reload --port 8000
python tests/evaluation_suite.py   # offline accuracy eval — no network/DB
```

### 3. WhatsApp OTP gateway (optional — required for seller verification)
```bash
cd backend/whatsapp-gateway
npm install
GATEWAY_SECRET=your-secret node index.js   # first run: scan the QR in the terminal
```

See **[CLAUDE.md](CLAUDE.md)** for the full environment-variable reference, data-layer schemas, ingestion scripts, and per-module documentation.

---

## Project status

Active FYP development. Notable in-progress items (full list in CLAUDE.md → *Key Gaps / In-Progress Areas*):
- RAG corpus is populated via ingestion scripts; the assistant degrades gracefully until then.
- Scheduled blog publishing currently needs a manual admin action (no cron yet).
- Production bundle needs route-based code-splitting to meet the performance budget.

---

*This is an academic project. Hardware data and pricing are illustrative; the marketplace targets a Pakistan-focused launch with global location support.*
