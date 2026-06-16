# NeuroBuilds — Complete Feature Setup Guide

> **Audience:** Developers setting up NeuroBuilds locally or on a new machine.
> **Last updated:** 2026-06-01
> **Covers:** Every feature that requires an external account, API key, or service.

---

## Table of Contents

1. [System Prerequisites](#1-system-prerequisites)
2. [Firebase Project Setup](#2-firebase-project-setup)
3. [MongoDB Atlas Setup](#3-mongodb-atlas-setup)
4. [API Keys — All External Services](#4-api-keys--all-external-services)
5. [FastAPI AI Backend](#5-fastapi-ai-backend)
6. [WhatsApp OTP Gateway](#6-whatsapp-otp-gateway)
7. [React Frontend (Vite)](#7-react-frontend-vite)
8. [Firestore Security Rules Deployment](#8-firestore-security-rules-deployment)
9. [Admin Panel Setup](#9-admin-panel-setup)
10. [Blog System Setup](#10-blog-system-setup)
11. [TOTP Two-Factor Authentication](#11-totp-two-factor-authentication)
12. [Seller Verification (WhatsApp OTP)](#12-seller-verification-whatsapp-otp)
13. [Ads System Setup](#13-ads-system-setup)
14. [AI Chat Assistant](#14-ai-chat-assistant)
15. [Marketplace Image Uploads](#15-marketplace-image-uploads)
16. [YouTube Video Reviews](#16-youtube-video-reviews)
17. [GNews Headlines Fallback](#17-gnews-headlines-fallback)
18. [Gemini Key Manager (Standalone)](#18-gemini-key-manager-standalone)
19. [Quick-Start Checklist](#19-quick-start-checklist)
20. [Port Reference](#20-port-reference)

---

## 1. System Prerequisites

Install all runtime engines before following any module below.

| Engine | Minimum Version | Purpose |
|--------|----------------|---------|
| **Node.js** | v18 LTS | React frontend + WhatsApp gateway |
| **npm** | v9+ (bundled with Node 18) | JavaScript dependency management |
| **Python** | 3.10 or higher (3.11 recommended) | FastAPI AI backend |
| **pip** | 23+ | Python dependency management |
| **Git** | Any modern version | Repository management |

```bash
node --version    # v18.x.x or higher
npm --version     # 9.x.x or higher
python --version  # Python 3.10.x or higher
pip --version     # pip 23.x or higher
```

### 1.1 Linux / WSL2 — Puppeteer System Libraries

The WhatsApp gateway runs a headless Chromium process. On Ubuntu/Debian/WSL2 these system libraries must be present or Chromium will silently crash.

```bash
sudo apt-get update && sudo apt-get install -y \
  ca-certificates fonts-liberation libappindicator3-1 libasound2 \
  libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 \
  libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 \
  libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 \
  libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 \
  libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 \
  libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release \
  wget xdg-utils
```

> **macOS / Windows:** Puppeteer bundles its own Chromium. No additional libraries needed.

---

## 2. Firebase Project Setup

Firebase provides Auth, Firestore, and Storage. Every frontend feature that reads or writes user data depends on this.

### 2.1 Create a Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → enter a project name (e.g. `neurobuilds-dev`)
3. Disable Google Analytics for development → **Create project**

### 2.2 Register a Web App

1. Inside your project, click the **Web** icon (`</>`) on the Project Overview page
2. Enter an app nickname (e.g. `neurobuilds-web`) — no Firebase Hosting needed
3. Click **Register app**
4. Copy the `firebaseConfig` object — you will need every value for your `.env.local` file (Section 7.3)

### 2.3 Enable Authentication Methods

1. In the left sidebar: **Build → Authentication → Get started**
2. Under the **Sign-in method** tab, enable:
   - **Email/Password** — click → toggle Enable → Save
   - **Google** — click → toggle Enable → enter a support email → Save

### 2.4 Create the Firestore Database

1. **Build → Firestore Database → Create database**
2. Choose **Start in production mode** (security rules will be deployed separately in Section 8)
3. Select a Cloud Firestore location closest to your users (e.g. `europe-west1` or `asia-south1`)
4. Click **Enable**

### 2.5 Create Composite Indexes

Firestore queries that sort or filter on multiple fields require manual composite indexes. Without these, queries will fail with a "requires an index" error in the browser console.

Navigate to **Firestore → Indexes → Composite** and create the following:

| Collection | Fields | Order |
|-----------|--------|-------|
| `blogs` | `isPublished` (Asc) · `createdAt` (Desc) | — |
| `listings` | `country` (Asc) · `postedDate` (Desc) | — |
| `conversations` | `participants` (Array) · `updatedAt` (Desc) | — |
| `conversations` | `participants` (Array) · `listingId` (Asc) | — |

> **Shortcut:** When you run the app and trigger a query that needs an index, Firestore prints a direct creation URL in the browser console. Click it to create the index instantly.

### 2.6 Enable Firebase Storage (optional — for future media uploads)

1. **Build → Storage → Get started**
2. Accept the default security rules → choose a region → **Done**

### 2.7 Download a Service Account Key (for Admin Promotion)

This is required for the `promote_admin.py` script (Section 9). Keep the JSON file **outside the repository**.

1. **Project Settings** (gear icon) → **Service Accounts** tab
2. Click **Generate new private key** → **Generate Key**
3. Move the downloaded `.json` file to a safe location outside the repo, e.g. `~/keys/neurobuilds-sa.json`

---

## 3. MongoDB Atlas Setup

MongoDB Atlas provides the vector database for RAG hardware lookups and the semantic LLM response cache.

### 3.1 Create a Free Cluster

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com) → **Create an account** (or sign in)
2. Click **Create** → select **M0 Free Tier** → choose a cloud provider and region → click **Create Deployment**
3. A username and password are generated — save them; you will need them for the connection string

### 3.2 Whitelist Your IP Address

1. In the left sidebar: **Security → Network Access → Add IP Address**
2. For development, click **Allow Access from Anywhere** (`0.0.0.0/0`) → **Confirm**
3. For production, whitelist only your server's IP

### 3.3 Get the Connection String

1. **Database → Connect → Drivers**
2. Copy the `mongodb+srv://...` string
3. Replace `<password>` with your database user's password
4. This becomes `MONGODB_ATLAS_URI` in `backend/.env`

### 3.4 Create the `vector_index` (required for RAG)

After running the ingest script (Section 5.6), create the Vector Search index:

1. In Atlas, navigate to your cluster → **Atlas Search** tab → **Create Search Index**
2. Select **Atlas Vector Search** → **JSON Editor**
3. Choose the `neurobuilds` database and `hardware_specs` collection
4. Paste this index definition:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1536,
      "similarity": "cosine"
    }
  ]
}
```

5. Name the index exactly `vector_index` → **Create Search Index**

### 3.5 Create the `semantic_cache_index` (optional — LLM response cache)

Repeat the same steps but target the `semantic_cache` collection:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1536,
      "similarity": "cosine"
    }
  ]
}
```

Name it exactly `semantic_cache_index`. Without this index, the semantic cache silently no-ops — the backend continues to work but every LLM call hits the OpenAI API.

---

## 4. API Keys — All External Services

Collect all keys before starting any service. Store them in the files indicated — never commit them.

### 4.1 OpenAI API Key (required — AI backend)

- Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- Click **Create new secret key** → copy the value starting with `sk-`
- Store in `backend/.env` as `OPENAI_API_KEY`
- Billing: the backend uses `gpt-4o-mini` by default; add a payment method and spending limit at [platform.openai.com/billing](https://platform.openai.com/billing)

### 4.2 Tavily API Key (web search — AI pipeline Node 1)

- Go to [app.tavily.com](https://app.tavily.com) → create account → **API Keys**
- Copy the key starting with `tvly-`
- Store in `backend/.env` as `TAVILY_API_KEY`
- The free tier provides 1,000 searches/month; the backend falls back gracefully if this key is absent

### 4.3 ImgBB API Key (marketplace image uploads)

- Go to [api.imgbb.com](https://api.imgbb.com) → log in or create account
- Click **Get API key** → copy the 32-character key
- Store in `.env.local` (frontend root) as `VITE_IMGBB_API_KEY`
- Free tier: unlimited uploads; images are publicly hosted

### 4.4 GNews API Key (news headlines fallback)

- Go to [gnews.io](https://gnews.io) → **Register** → **API** tab → copy your key
- Store in `.env.local` as `VITE_GNEWS_API_KEY`
- Free tier: 100 requests/day; the frontend applies a 60-minute backoff on HTTP 429 responses

### 4.5 YouTube Data API v3 Key (hardware review carousels)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or reuse an existing one)
3. **APIs & Services → Enable APIs → search "YouTube Data API v3" → Enable**
4. **APIs & Services → Credentials → Create Credentials → API key**
5. Copy the key starting with `AIza`
6. Store in `.env.local` as `VITE_YOUTUBE_API_KEY`
7. Optionally restrict the key to the YouTube Data API and your domain under **Edit API key**

---

## 5. FastAPI AI Backend

The backend is a standalone Python service that must run separately from Vite.

### 5.1 Navigate to the Backend Directory

```bash
cd backend
```

All commands in this section run from `backend/`.

### 5.2 Create and Activate a Virtual Environment

```bash
# Create (run once)
python -m venv .venv

# Activate — Windows PowerShell
.venv\Scripts\Activate.ps1

# Activate — macOS / Linux / WSL2
source .venv/bin/activate
```

Your terminal prompt will show `(.venv)` when active. Re-activate after closing and reopening the terminal.

### 5.3 Install Python Dependencies

```bash
pip install -r requirements.txt
```

Installs: FastAPI, Uvicorn, LangChain, LangGraph, LangChain-OpenAI, LangChain-MongoDB, Tavily, PyMongo, Firebase Admin SDK, httpx, python-dotenv.

### 5.4 Configure the Backend Environment File

```bash
cp .env.example .env
```

Open `backend/.env` and populate every value:

```dotenv
# Required
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# Optional but recommended — falls back gracefully if missing
TAVILY_API_KEY=tvly-...

# MongoDB Atlas — replace <user>, <password>, <cluster>
MONGODB_ATLAS_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
MONGODB_DATABASE=neurobuilds
MONGODB_COLLECTION=hardware_specs
MONGODB_VECTOR_INDEX=vector_index
MONGODB_CATALOG_COLLECTION=hardware_catalog
MONGODB_CACHE_COLLECTION=semantic_cache

# CORS — add your production domain here when deploying
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# WhatsApp gateway — only change if running on a non-default port
WHATSAPP_GATEWAY_URL=http://127.0.0.1:3001
GATEWAY_SECRET=change-me-to-a-long-random-string
```

> **Security:** Never commit `backend/.env`. Verify it is listed in `.gitignore`.

### 5.5 Initialize the Hardware Catalog (one-time)

Populates the `hardware_catalog` MongoDB collection used by `/api/hardware/lookup`.

```bash
python scripts/ingest_hardware.py
```

### 5.6 Initialize the RAG Vector Store (one-time, recommended)

Generates OpenAI embeddings and upserts hardware specs into `hardware_specs`. The `rag_node` falls back to empty results until this is run.

```bash
python ../misc/scripts/ingest-rag.py
```

Requires `OPENAI_API_KEY` in `backend/.env`. After this completes, create the `vector_index` in Atlas as described in Section 3.4.

### 5.7 Start the Backend

```bash
uvicorn main:app --reload --port 8000
```

Verify:

```bash
curl http://localhost:8000/health
# {"status":"ok","service":"neurobuilds-ai"}
```

---

## 6. WhatsApp OTP Gateway

Standalone Node.js microservice that delivers OTPs via a linked WhatsApp account.

> **Prerequisite:** A secondary phone with WhatsApp installed for the first-run QR scan. The linked number will be the "sender" of all OTP messages.

### 6.1 Navigate to the Gateway Directory

```bash
cd backend/whatsapp-gateway
```

### 6.2 Install Node Dependencies

```bash
npm install
```

Downloads `express`, `whatsapp-web.js`, and Puppeteer with its bundled Chromium. Takes several minutes on first run.

### 6.3 Choose and Set a Shared Secret

Generate a random secret:

```bash
# macOS / Linux
openssl rand -hex 32

# Windows PowerShell
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

Copy the output. This value must be:
- Set as `GATEWAY_SECRET` when starting the gateway process (below)
- Set as `GATEWAY_SECRET` in `backend/.env` (same value, byte-for-byte identical)

If the two values differ, every OTP dispatch from FastAPI will receive an HTTP 401 response.

### 6.4 First-Run: QR Code Scan (one-time per machine)

```bash
# Windows PowerShell
$env:GATEWAY_SECRET="your-generated-secret"; node index.js

# macOS / Linux
GATEWAY_SECRET=your-generated-secret node index.js
```

An ASCII QR code appears in the terminal. Scan it:

1. Open WhatsApp on your secondary phone
2. Navigate to **Settings → Linked Devices → Link a Device**
3. Point the camera at the terminal QR code
4. Wait for: `[WhatsApp Gateway] Client ready. OTP delivery is operational.`

Verify:

```bash
curl http://127.0.0.1:3001/health
# {"ready":true,"status":"ready","service":"neurobuilds-whatsapp-gateway"}
```

### 6.5 Subsequent Starts (session is cached in `.wwebjs_auth/`)

```bash
# Development (auto-restart on file changes)
GATEWAY_SECRET=your-secret npm run dev

# Production-equivalent
GATEWAY_SECRET=your-secret node index.js
```

### 6.6 Session Reset (if auth fails)

```bash
rm -rf .wwebjs_auth
GATEWAY_SECRET=your-secret node index.js
# A new QR code appears — scan again
```

> Do not commit `.wwebjs_auth/` to the repository. It contains authentication tokens.

---

## 7. React Frontend (Vite)

### 7.1 Install Dependencies

From the repository root:

```bash
npm install
```

### 7.2 Configure Frontend Environment Variables

Create `.env.local` at the repository root (already `.gitignore`d):

```dotenv
# Firebase — copy from Firebase Console → Project Settings → Your Apps → Config
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:abc123

# FastAPI backend URL (change only if running on a non-default port)
VITE_AI_SERVICE_URL=http://localhost:8000

# External API keys (see Section 4 for acquisition)
VITE_IMGBB_API_KEY=...
VITE_GNEWS_API_KEY=...
VITE_YOUTUBE_API_KEY=AIza...
```

### 7.3 Start the Development Server

```bash
npm run dev
```

App is available at **http://localhost:5173**. Vite provides Hot Module Replacement.

### 7.4 Build for Production

```bash
npm run build
```

TypeScript type-checks the project, then outputs a production bundle to `dist/`. Preview it locally:

```bash
npm run preview
```

---

## 8. Firestore Security Rules Deployment

Firestore rules control who can read and write every collection. The rules file is at `firestore.rules` in the repository root.

### 8.1 Install the Firebase CLI

```bash
npm install -g firebase-tools
```

### 8.2 Log In to Firebase

```bash
firebase login
```

A browser window opens — authenticate with the Google account that owns the Firebase project.

### 8.3 Initialise Firebase in the Repository (one-time)

```bash
firebase init firestore
```

When prompted:
- Select **Use an existing project** → choose your project
- Accept the default `firestore.rules` filename (the file already exists in the repo)
- Accept the default `firestore.indexes.json` filename

This creates `firebase.json` and `.firebaserc` at the root if they do not already exist.

### 8.4 Deploy Rules and Indexes

```bash
# Deploy security rules only
firebase deploy --only firestore:rules

# Deploy composite indexes only
firebase deploy --only firestore:indexes

# Deploy both
firebase deploy --only firestore
```

> **Warning:** Deploying with overly permissive rules (`allow read, write: if true`) exposes all user data publicly. Always deploy the rules from `firestore.rules` in this repository — they enforce authentication, role checks, and field-level immutability.

### 8.5 Verify Rules Are Active

In the Firebase Console: **Firestore → Rules** tab. The timestamp should match your last deploy. You can test individual rules using the built-in **Rules Playground**.

---

## 9. Admin Panel Setup

The admin workspace at `/admin` requires two things: an authenticated account and the `admin` role written to both Firestore and the Firebase JWT.

### 9.1 How Admin Access Works

The system checks two independent locations:

| Check | Location | Purpose |
|-------|----------|---------|
| `useAdminRole()` / `useUserRole()` | `users/{uid}.role == 'admin'` in Firestore | Shows/hides Admin tab in the React UI |
| `isAdmin()` in Firestore rules | `request.auth.token.admin == true` (JWT claim) | Allows admin-only Firestore operations |

Both must be set. Writing only to Firestore grants UI access but Firestore will deny admin-only writes. Writing only the JWT claim satisfies the rules but the UI tabs stay hidden.

### 9.2 Sign Up First

The target user must exist in Firebase Auth. Open `http://localhost:5173`, click **Sign Up**, and complete registration with the email you want to promote.

### 9.3 Run the Promotion Script

Make sure your Python virtual environment is active, then from `backend/`:

```bash
# Step 1: open the script and set the target email
# Edit line ~40 in backend/scripts/promote_admin.py:
#   TARGET_EMAIL = "your-email@example.com"

# Step 2: run it (pass the service account key downloaded in Section 2.7)
python scripts/promote_admin.py --key /path/to/your/neurobuilds-sa.json
```

Expected output:

```
[→] Looking up Firebase Auth user: your-email@example.com
    UID resolved: abc123XyzDEF456...

[✓] Firestore  users/abc123XyzDEF456....role = 'admin'
[✓] Custom JWT claim set: {'admin': True}

══════════════════════════════════════════════════════════
  Promotion complete.
  Email : your-email@example.com
  UID   : abc123XyzDEF456...
  Firestore role : admin
  JWT claim      : { admin: true }

  ⚠  Sign out and sign back in to refresh the JWT token.
══════════════════════════════════════════════════════════
```

### 9.4 Sign Out and Sign Back In (mandatory)

Firebase ID tokens are cached in the browser. The `admin: true` claim only appears in a freshly issued token. Until you re-authenticate, Firestore rules will deny all admin operations — even though the script succeeded.

1. Click your avatar → **Sign Out**
2. Sign back in with the same account
3. Navigate to `http://localhost:5173/admin`

The Admin workspace shows five tabs: **Review Console**, **Moderation Desk**, **Analytics**, **Role Matrix**, **Telemetry**.

> If the `/admin` route still denies access after signing back in, hard-refresh (`Ctrl+Shift+R`) to force a fresh token. If it still fails, re-run the promotion script and repeat the sign-out cycle.

### 9.5 Admin Panel Feature Overview

| Tab | What It Does |
|-----|-------------|
| **Review Console** | Approve or reject blog posts in the `pending_review` queue; inline editing before approval; schedule future publish dates |
| **Moderation Desk** | View all user reports (`reports` collection); hide reported listings/threads; resolve reports |
| **Analytics** | Horizontal bar charts: most-commented blogs, top community categories by upvotes, most-saved listings |
| **Role Matrix** | Search users by name; assign `user / vendor / moderator / admin` roles with real-time Firestore updates |
| **Telemetry** | Live AI performance metrics, cache hit ratios, compatibility validation counts; export JSON snapshot |

---

## 10. Blog System Setup

The blog is fully Firestore-backed. No additional infrastructure is needed beyond a running Firebase project and an admin account.

### 10.1 How the Blog Lifecycle Works

```
draft → pending_review → published   (admin approves immediately)
                      → scheduled    (admin approves with a future publishAt)
pending_review → draft               (admin rejects — adds rejectionNote)
```

### 10.2 Who Can Create Blog Posts

- **Any authenticated user** can create `draft` or `pending_review` posts attributed to themselves
- Only **admins** can publish, schedule, reject, or delete posts
- The public sees only `isPublished == true` posts

### 10.3 Creating Your First Blog Post

1. Sign in at `http://localhost:5173/blog`
2. Click **New Post** (visible to admins and regular users)
3. Fill in: Title, Category (`Tutorial / Hardware / Industry`), Content (markdown supported), optional Featured Image URL and YouTube video link
4. Set Status to **Submit for Review** to enter the moderation queue, or **Draft** to save privately
5. Click **Save**

### 10.4 Approving a Post (Admin)

1. Navigate to `/admin` → **Review Console** tab
2. Posts with `pending_review` status appear here in real time
3. Optionally edit the title or content inline
4. Click **Approve** for immediate publish, or set a future date for scheduled publishing
5. Click **Reject** to return to draft with a rejection note visible to the author

### 10.5 Blog Comments

Comments are enabled on all published posts. Any authenticated user can add a comment; authors can delete their own; admins can delete any. Comment counts stay in sync via Firestore transactions.

### 10.6 Scheduled Publishing Note

Posts approved with a future `publishAt` date will be stored with `status: 'scheduled'` but are **not auto-published** — there is no cron job or Cloud Function wired yet. An admin must manually re-approve to publish at the correct time.

---

## 11. TOTP Two-Factor Authentication

TOTP 2FA lets users enroll an authenticator app (Google Authenticator, Authy, etc.) as a second sign-in factor.

### 11.1 Enable Multi-Factor Auth in Firebase Console

1. In the Firebase Console: **Authentication → Sign-in method → Advanced → Multi-factor authentication**
2. Toggle **Enable** → **Save**
3. You may be prompted to upgrade to the Blaze (pay-as-you-go) plan — MFA requires it

### 11.2 How Users Enroll

1. Navigate to `http://localhost:5173/profile` → **Two-Factor Authentication** section
2. Click **Enroll TOTP**
3. A QR code appears — scan it with any TOTP authenticator app
4. Enter the 6-digit code from the app to confirm enrollment
5. On future sign-ins, Firebase will prompt for the TOTP code after the password

### 11.3 Troubleshooting

- If the QR code fails to display, verify that Multi-factor Auth is enabled in the Firebase console (Step 11.1)
- The Blaze plan is required — the Spark (free) plan does not support MFA
- The Firebase project must be in a supported region for MFA

---

## 12. Seller Verification (WhatsApp OTP)

Phone verification marks a user as a trusted seller and enables listing creation.

### 12.1 WhatsApp OTP Flow

All three processes must be running: Vite (5173), FastAPI (8000), WhatsApp Gateway (3001).

1. Sign in and navigate to `http://localhost:5173/marketplace`
2. Click **Sell / List a Part** — the Seller Verification modal appears if not yet verified
3. Enter your phone number in E.164 format (e.g. `+923001234567`)
4. Click **Send OTP** — a real 6-digit OTP is dispatched via WhatsApp
5. Enter the code received on WhatsApp
6. Success: `isVerified: true` and `phoneNumber` are written to `users/{uid}` in Firestore

The OTP expires after 5 minutes. See Section 6 for WhatsApp gateway setup (first-run QR scan).

---

## 13. Ads System Setup

The platform supports three ad placements. Two are backed by static data; one is Firestore-backed and configurable via Firestore directly.

### 13.1 Static Ads (no setup needed)

`SponsoredAdBanner` and `SponsoredNodeMicro` use hardcoded data from `src/data/sponsoredAds.ts`. They work out of the box with no external dependencies.

To change the static ads, edit `src/data/sponsoredAds.ts`:
- `BANNER_ADS` — full-width rotating banner (currently: ASUS ROG, Corsair, NZXT, EVGA)
- `MICRO_ADS` — one-line inline ticker (currently: Kingston, Seagate, be quiet!, Gigabyte)

### 13.2 Dynamic Firestore Ads (`HomeFeedAdSlot`)

The `HomeFeedAdSlot` on the homepage reads live from the `advertisements` Firestore collection.

**Create an ad document manually in Firestore:**

1. In the Firebase Console: **Firestore → advertisements → Add document**
2. Use an auto-generated document ID
3. Set the following fields:

| Field | Type | Example Value |
|-------|------|--------------|
| `title` | string | `Summer Sale — Up to 40% Off RAM` |
| `sponsorName` | string | `Kingston Technology` |
| `tagline` | string | `DDR5 6000MHz kits from PKR 18,000` |
| `targetUrl` | string | `https://www.kingston.com` |
| `imageUrl` | string | _(optional — leave blank for gradient fallback)_ |
| `placement` | string | `homepage_feed` |
| `status` | string | `active` |
| `accent` | string | `cyan` or `purple` |

4. The ad appears on the homepage within seconds — `HomeFeedAdSlot` uses a real-time `onSnapshot` listener.

Setting `status` to `inactive` removes the ad from display without deleting the document.

---

## 14. AI Chat Assistant

The AI chat at `/chat` requires the FastAPI backend (Section 5) to be running. It falls back to a mock response if the backend is unreachable.

### 14.1 How It Works

1. User sends a message in the terminal-style chat panel
2. The frontend POSTs to `http://localhost:8000/api/chat` with message history and the current build state
3. The LangGraph pipeline runs: web search (Tavily) → RAG lookup (MongoDB) → intent parsing (OpenAI) → budget allocation → compatibility checks → streaming narration
4. Response tokens stream to the browser in real time
5. If the backend is unreachable or times out (10 s), a local mock response streams at ~22 ms/token
6. Any `json { "build": {...} }` block in the response is parsed and merged into the live build canvas on the right

### 14.2 Verifying Backend Connection

Open the browser console at `http://localhost:5173/chat`. If you see "AI service unavailable — using mock responses", the frontend cannot reach `http://localhost:8000`. Check that:
- The FastAPI backend is running (`uvicorn main:app --reload --port 8000`)
- `VITE_AI_SERVICE_URL` in `.env.local` matches the backend URL
- No CORS error appears in the console (check `CORS_ORIGINS` in `backend/.env`)

### 14.3 Session Persistence

Completed chat sessions are automatically saved to `users/{uid}/aiSessions` in Firestore. The left sidebar lists the 20 most recent sessions. Click any session to restore the full message history and build state.

### 14.4 Build Sharing

The **Share Build** button encodes the active build as a base64 URL parameter and opens `/share?build=<encoded>` in a new tab. This page is publicly accessible without auth and shows a full read-only build spec with a power speedometer gauge.

---

## 15. Marketplace Image Uploads

Marketplace listings support up to 6 images, hosted on ImgBB.

### 15.1 Get an ImgBB API Key

See Section 4.3. Set `VITE_IMGBB_API_KEY` in `.env.local`.

### 15.2 How It Works

Images are uploaded directly from the browser via `src/utils/imageUploader.ts` (`uploadImageToImgBB`). The function returns a public ImgBB URL which is stored in the `images[]` array of the Firestore listing document.

If `VITE_IMGBB_API_KEY` is not set, the image upload button will be disabled and an error is shown in the listing creation modal.

---

## 16. YouTube Video Reviews

Hardware listing detail modals show a carousel of relevant YouTube reviews fetched from the YouTube Data API.

### 16.1 Get a YouTube Data API v3 Key

See Section 4.5. Set `VITE_YOUTUBE_API_KEY` in `.env.local`.

### 16.2 How It Works

`src/services/youtubeService.ts` searches for reviews from Gamers Nexus, Hardware Unboxed, and Linus Tech Tips. Results are cached in `sessionStorage` per component name for 24 hours to avoid hitting the daily quota.

If the key is absent or the quota is exhausted, the carousel section does not render — the rest of the listing modal is unaffected.

### 16.3 Quota Management

The YouTube Data API v3 free tier provides 10,000 quota units/day. Each search request costs 100 units. At three searches per unique component name (cached for 24 hours), you can serve ~33 unique components per day on the free tier before the carousel silently disappears.

---

## 17. GNews Headlines Fallback

When a user selects a country with no listings or threads, the app fetches top-6 tech headlines as a content placeholder.

### 17.1 Get a GNews API Key

See Section 4.4. Set `VITE_GNEWS_API_KEY` in `.env.local`.

### 17.2 How It Works

`src/components/NewsFallback/` fetches from the GNews API, filtered by `COUNTRY_ISO` mapping in `src/data/globalLocations.ts`. Results are cached in `localStorage` for 24 hours. On HTTP 429 (rate limit), a 60-minute backoff is applied automatically.

If the key is absent or the rate limit is hit, the fallback section renders nothing — no error is surfaced to the user.

---

## 18. Gemini Key Manager (Standalone)

The Gemini Key Manager is a standalone TypeScript utility for API key rotation and load-balancing. It is not wired into the main NeuroBuilds app at runtime — it is a reference implementation and test harness.

### 18.1 Install Dependencies

```bash
cd gemini-key-manager
npm install
```

### 18.2 Run in Dry-Run Mode (no real keys needed)

```bash
npm run dev
```

Runs the 5-phase test harness with mock keys. Demonstrates sequential warm-up, concurrent burst, embedding burst, throttle recovery, and pool stats.

### 18.3 Run with Real Gemini Keys

```bash
GEMINI_KEY_1=AIza... GEMINI_KEY_2=AIza... npm run dev
```

Supports up to 10 keys (`GEMINI_KEY_1` … `GEMINI_KEY_10`). The manager automatically distributes requests across the pool and handles 429 rate limit responses with exponential backoff.

---

## 19. Quick-Start Checklist

Use this checklist when setting up a new development machine from scratch.

```
System Prerequisites
  [ ] Node.js v18+ installed and verified
  [ ] Python 3.10+ installed and verified
  [ ] Linux/WSL2 only: Puppeteer system libraries installed (§1.1)

Firebase Project
  [ ] Firebase project created
  [ ] Web app registered; firebaseConfig values copied
  [ ] Email/Password and Google auth methods enabled
  [ ] Firestore database created in production mode
  [ ] Service account JSON downloaded to a location outside the repo

MongoDB Atlas
  [ ] Free M0 cluster created
  [ ] Database user with read/write access created
  [ ] IP 0.0.0.0/0 whitelisted for development
  [ ] Connection string (MONGODB_ATLAS_URI) copied

API Keys
  [ ] OPENAI_API_KEY obtained (platform.openai.com)
  [ ] TAVILY_API_KEY obtained (app.tavily.com) — optional
  [ ] VITE_IMGBB_API_KEY obtained (api.imgbb.com) — for marketplace images
  [ ] VITE_GNEWS_API_KEY obtained (gnews.io) — for news fallback
  [ ] VITE_YOUTUBE_API_KEY obtained (Google Cloud Console) — for review carousels

FastAPI Backend (backend/)
  [ ] python -m venv .venv && activate
  [ ] pip install -r requirements.txt
  [ ] backend/.env created from .env.example; all values filled in
  [ ] python scripts/ingest_hardware.py (one-time hardware catalog)
  [ ] python ../misc/scripts/ingest-rag.py (one-time RAG embeddings)
  [ ] vector_index created in Atlas (§3.4)
  [ ] semantic_cache_index created in Atlas (§3.5) — optional
  [ ] uvicorn main:app --reload --port 8000 — curl /health returns ok

WhatsApp Gateway (backend/whatsapp-gateway/)
  [ ] npm install
  [ ] GATEWAY_SECRET generated (openssl rand -hex 32)
  [ ] First-run QR scan completed; curl /health returns "status":"ready"
  [ ] GATEWAY_SECRET in backend/.env matches gateway exactly

React Frontend (repository root)
  [ ] npm install
  [ ] .env.local created with all VITE_ variables populated
  [ ] npm run dev — http://localhost:5173 loads without console errors

Firestore Security Rules
  [ ] npm install -g firebase-tools
  [ ] firebase login
  [ ] firebase init firestore (one-time)
  [ ] firebase deploy --only firestore

Admin Panel
  [ ] Target user signed up at http://localhost:5173
  [ ] TARGET_EMAIL updated in backend/scripts/promote_admin.py
  [ ] python scripts/promote_admin.py --key /path/to/sa.json
  [ ] Signed out and signed back in to refresh JWT
  [ ] /admin route loads all five tabs

Blog System
  [ ] Firebase project and Firestore running
  [ ] Admin account active (above)
  [ ] Test post created, submitted for review, and approved

Seller Verification
  [ ] WhatsApp gateway running and status is "ready"
  [ ] Real OTP delivered and verified end-to-end

Optional Features
  [ ] TOTP 2FA: Multi-factor Auth enabled in Firebase Console (§11.1)
  [ ] Ads: advertisement documents added to Firestore (§13.2)
  [ ] YouTube reviews: VITE_YOUTUBE_API_KEY set and quota monitored
```

---

## 20. Port Reference

All three backend processes must run concurrently for the full feature set to be available.

| Service | Default Port | Start Command | Directory |
|---------|-------------|---------------|-----------|
| React + Vite Frontend | `5173` | `npm run dev` | repository root |
| FastAPI AI Backend | `8000` | `uvicorn main:app --reload --port 8000` | `backend/` |
| WhatsApp OTP Gateway | `3001` | `GATEWAY_SECRET=... node index.js` | `backend/whatsapp-gateway/` |

### Recommended Terminal Layout

```
Terminal 1 (repo root):   npm run dev
Terminal 2 (backend/):    source .venv/bin/activate && uvicorn main:app --reload --port 8000
Terminal 3 (gateway/):    GATEWAY_SECRET=your-secret npm run dev
```
