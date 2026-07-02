# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (Vite / React)
```bash
npm run dev       # Start Vite dev server with HMR on http://localhost:5173
npm run build     # TypeScript type-check + production build
npm run lint      # Run ESLint
npm run preview   # Preview production build locally
```

### Backend (FastAPI / Python)
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000   # Start AI service on http://localhost:8000
python tests/evaluation_suite.py        # Offline accuracy eval — no network/DB needed
```

Copy `backend/.env.example` to `backend/.env` and fill in API keys before starting the backend.

### WhatsApp OTP Gateway (Node / Express)
```bash
cd backend/whatsapp-gateway
npm install
GATEWAY_SECRET=your-secret node index.js   # First run: scan QR in terminal
npm run dev                                 # node --watch for development
```

On first run a QR code appears in the terminal — scan with WhatsApp → Settings → Linked Devices → Link a Device. Session is persisted via `LocalAuth` (`.wwebjs_auth/` directory) and survives restarts.

## Project Overview

**NeuroBuilds** is a React + TypeScript + Vite web app for a PC hardware builder community platform — marketplace, community forums, real-time P2P chat, blog, and an AI PC-build assistant. University Final Year Project (FYP) in active development.

## Architecture

### Routing (`src/App.tsx`)

React Router v7, flat route structure. An `<ErrorBoundary>` wraps the entire app tree. Provider tree inside:

```
<SplashScreen />           ← 860 ms fade-in/out overlay rendered before providers
<ThemeProvider>
  <ErrorBoundary>
    <CountryProvider>
      <ChatProvider>
        <Navbar />           ← hidden on /share
        <ChatSidebar />      ← global overlay, always mounted; hidden on /share
        <AuthModal />        ← hidden on /share
        <Routes />
        <Footer />           ← hidden on /share
      </ChatProvider>
    </CountryProvider>
  </ErrorBoundary>
</ThemeProvider>
```

The `/share` route uses a standalone layout — all chrome (Navbar, ChatSidebar, AuthModal, Footer) is suppressed via an `isSharePage` guard in `App.tsx`.

| Path | Component |
|------|-----------|
| `/` | `HomePage` — landing + live Firestore stats (active listings count, thread count) + featured blog post + community feed threads + `BannerCarousel` + a `LIVE_FEED` glass-panel strip wrapping `HomeFeedAdSlot` (below the AI chat bar) |
| `/chat` | `ChatPage` → `AIChatPanel` — AI build assistant |
| `/blog` | `BlogPage` — Firestore-backed blog with admin CMS; uses `useUserRole` for role gating; supports deep-linking via `location.state` |
| `/marketplace` | `MarketplacePage` — Firestore listings |
| `/community` | `CommunityPage` — Firestore forums; supports deep-linking via `location.state.openThreadId` to auto-open a thread modal on mount |
| `/dashboard` | `Dashboard` — user's own listings, saved listings, and threads (Firestore real-time) |
| `/profile` | `ProfilePage` — display name, avatar URL, phone number, username (requires auth) |
| `/admin` | `AdminPage` — admin workspace: review queue, moderation desk, analytics, role management (requires `role: 'admin'`) |
| `/pricing` | `PricingPage` — renders `GradientBackground` + `Pricing` component |
| `/seller/:uid` | `SellerProfilePage` — public seller profile: avatar, display name, verified badge, role badge, bio, member-since date, and a grid of the seller's active listings; requires sign-in (redirects to auth modal if unauthenticated); "Edit Profile" button visible only on own profile |
| `/share` | `SharedBuildPage` — standalone read-only view of a shared AI build (no auth required) |
| `/dev/seed` | `DevSeedPage` — dev-only (`import.meta.env.DEV` guard); seeds Firestore with Pakistan-focused threads and marketplace listings |

### Data Layer

**Firestore (all live user data):**
- `listings` → `useMarketplace`
- `threads` + `threads/{id}/replies` → `useCommunity`
- `conversations` + `conversations/{id}/messages` → `useChats`
- `blogs` + `blogs/{id}/comments` → `useBlogCMS` / `useBlogFeed` / `useBlogComments` / `useReviewQueue`
- `reports` → `useReports`; `appeals` → `useAppeals`; `audit_logs` → `src/utils/auditLog.ts`
- `advertisements` → `useAdvertisements` — Firestore-backed dynamic ad slots; documents carry `title`, `sponsorName`, `targetUrl`, `imageUrl`, `placement`, `status: 'active' | 'inactive'`, `accent: 'cyan' | 'purple'`, `featured?: boolean` + `featuredUntil?: Timestamp | null` (admin-toggled for a fixed 7/14/30-day run; promotes the ad into the premium top block of the `marketplace_grid` placement). `isFeaturedActive(ad)` (exported from `useAdvertisements`) is the single source of truth for "is this ad currently featured" — `true` only while `featured` is set **and** `featuredUntil` hasn't lapsed (or is unset); a lapsed featured ad falls back into the normal slot automatically, purely client-side, with no backend expiry sweep needed
- `market_intel` (MongoDB, **not** Firestore) → weekly GenAI market-analysis snapshots (hot products, price ranges/movements, dead inventory); written by `services/market_intel.py`, surfaced in the Admin **Market Intel** tab, fed to the AI chat via `agent.py`'s `market_node`
- `users/{uid}` → role (`role: 'user' | 'vendor' | 'moderator' | 'admin'`) + seller verification (`isVerified`, `phoneNumber`) + account moderation (`accountStatus: 'active' | 'disabled'`, `disabledReason`) + profile fields + `username`
- `users/{uid}/aiSessions` → `useAISessions` — AI chat session history (newest-first, limit 20)
- `users/{uid}/notifications` → `useNotifications` — in-app notifications (newest-first, limit 30)
- `usernames/{username}` → username → UID reverse-lookup index (atomic claim/release via `writeBatch`)

**localStorage** (seeded from `src/data/storage.json`) → `useStorage`:
Static/UI-only data: `NavLink`, `FooterLink`, `Feature`, `Testimonial`, `PricingTier`, `FAQItem`, `HowItWorksStep`, `appConfig`.

### Authentication

Firebase Auth only — email/password + Google OAuth + GitHub OAuth. `useAuth` exposes `{ user, loading, error, register, login, googleSignIn, githubSignIn, logout }`. `src/Firebase.ts` exports `auth`, `db`, `storage`, and `firebaseAuth`.

`firebaseAuth` is a typed wrapper object (not the raw `Auth` instance) exposing: `register`, `login`, `googleSignIn`, `githubSignIn`, `logout`, `updateUserProfile`, `sendPasswordReset`, `getCurrentUser`, `onAuthStateChange`.

GitHub sign-in requires a GitHub OAuth App (github.com/settings/developers) with authorization callback URL `https://<project-id>.firebaseapp.com/__/auth/handler`, and the resulting Client ID/Secret entered into the GitHub provider in Firebase Console → Authentication → Sign-in method (this manual console step is not part of the codebase).

> **TOTP 2FA — removed.** The multi-factor authentication feature (TOTP enrollment in `ProfilePage` + the sign-in MFA challenge in `AuthModal`) was removed because the project runs on the Firebase **Spark (free) plan**, which does not support TOTP MFA (the `TotpMultiFactorGenerator` enrollment call fails with `auth/operation-not-allowed`). MFA requires the paid Identity Platform upgrade. `qrcode.react` remains a dependency but is no longer used.

### Role System

Four roles in `users/{uid}.role`: `user` | `vendor` | `moderator` | `admin`.

- `useUserRole()` — fetches role + exposes `isAdmin`, `isModerator`, `isVendor` boolean helpers (replaces the simpler `useAdminRole`). `isAdmin` is derived from the signed-in user's **JWT `admin` custom claim** (`getIdTokenResult()`), mirroring `firestore.rules` `isAdmin()` — not the Firestore `role` field — so the UI can't show a "ghost admin" who would fail every privileged write. `role`/`isModerator`/`isVendor` still come from the Firestore doc. Falls back to the `role` field only when inspecting a uid other than the current user.
- `useAdminRole(uid)` — legacy hook; still used by blog/admin gates; also reads the JWT claim for the current user (Firestore-role fallback for other uids)
- `RoleAssignmentMatrix` (Admin tab 4) — admin UI to search users and reassign roles; calls `POST /api/admin/users/{uid}/role` (NOT a direct client `updateDoc`), so each change sets the Firestore role **and** the JWT `admin` claim server-side

Role changes in Firestore are immutable to non-admins via `firestore.rules`; the only path that mutates a role is the `require_admin`-guarded backend endpoint. The affected user must refresh their session (sign out/in) before the new claim is active.

### Hooks

| Hook | Source | Purpose |
|------|--------|---------|
| `useAuth` | Firebase Auth | Auth state + login/register/logout |
| `useStorage` | localStorage | Static UI config |
| `useMarketplace` | Firestore `listings` | Listing CRUD, filtering, save/unsave |
| `useCommunity` | Firestore `threads` | Thread + reply CRUD, voting, real-time `onSnapshot` |
| `useChats` | Firestore `conversations` | Real-time P2P + group chat conversations + messages |
| `useBlogCMS` | Firestore `blogs` | Blog CRUD + review workflow (`createBlogPost`, `updateBlogPost`, `deleteBlogPost`, `approvePost`, `rejectPost`, `schedulePost`) |
| `useBlogFeed` | Firestore `blogs` | Real-time feed; `isAdmin=true` shows all posts, else `isPublished=true` only |
| `useReviewQueue` | Firestore `blogs` | Server-side filtered `onSnapshot` for `status in ['pending_review', 'scheduled']`; posts disappear the instant they are approved/rejected |
| `useAdvertisements` | Firestore `advertisements` | Real-time active ads by placement string; used by `HomeFeedAdSlot` |
| `useBlogComments` | Firestore `blogs/{id}/comments` | Per-post comment thread; `addComment`, `deleteComment` (with Firestore transaction on `commentCount`) |
| `useAdminRole` | Firestore `users/{uid}` | Checks `role === 'admin'` — gates blog editor and admin page |
| `useUserRole` | Firestore `users/{uid}` | Full role fetch + `isAdmin`, `isModerator`, `isVendor` booleans |
| `useReports` | Firestore `reports` | Platform moderation: `createReport` (supports `proofUrl` + `targetType: 'user'`), `resolveReport`, `hideTarget` |
| `useAdminModeration` | FastAPI `/api/admin/users/{uid}/account-status` | Admin-only: `setAccountStatus(uid, 'active'\|'disabled', reason?)` — disable/re-enable a marketplace account server-side; writes an audit-log entry |
| `useAppeals` | Firestore `appeals` | Admin-only live feed of moderation appeals (`orderBy createdAt desc`); `resolveAppeal(id)` |
| `useNotifications` | Firestore `users/{uid}/notifications` | Real-time in-app notifications (limit 30, newest-first); `markRead`, `markAllRead`; exports `writeNotification()` helper for writing to another user's subcollection; notification type extended with `listing_expired` |
| `useAIAssistant` | FastAPI / mock | AI chat with streaming, build extraction, voice input |
| `useAISessions` | Firestore `users/{uid}/aiSessions` | Persist/load AI chat sessions; `saveSession(id, title, messages, activeBuild)`; real-time `onSnapshot`, ordered newest-first, limit 20 |
| `useSellerVerification` | Firestore `users` + FastAPI `/api/verify` | Phone OTP flow via WhatsApp gateway; `sendVerificationCode` POSTs to `/api/verify/request`, `verifyOTP` POSTs to `/api/verify/confirm` |

### Notifications System (`src/components/Notifications/`)

- **`NotificationBell.tsx`** — bell icon in Navbar showing unread count badge; click opens drawer; click-outside detection to dismiss
- **`NotificationDrawer.tsx`** — dropdown listing last 30 notifications; mark-read on click; types: `blog_comment`, `thread_reply`, `marketplace_message`, `ai_build_ready`, `listing_expired`; navigation links per type
- **`writeNotification(uid, data)`** — exported from `useNotifications`; any hook/service calls this to push a notification into another user's subcollection

### Ads System (`src/components/Ads/`)

Ad components, all following the cyberpunk design system. Some are backed by static data; the dynamic slots (homepage feed, marketplace grid) are Firestore-backed.

- **`BannerCarousel.tsx`** — full-image hero carousel (replaces `SponsoredAdBanner` on the homepage grid); Firestore-backed via `useAdvertisements('banner')` with static `BANNER_ADS` fallback; crossfades every 5.5 s with a 300 ms fade transition; resets index when slide count changes (Firestore load); shows a skeleton while loading, renders nothing if no slides
- **`SponsoredAdBanner.tsx`** — full-width rotating banner (legacy/non-homepage use); crossfades every 5.5 s; progress bar at bottom tracks position; gradient icon fallback when `imageUrl` is empty; `accent` prop controls cyan/purple theming; defaults to `BANNER_ADS` from `sponsoredAds.ts`
- **`SponsoredNodeMicro.tsx`** — one-line inline ticker ("SPON" tag + sponsor // tagline) that slides in from left every 4.2 s; used inside listing/thread cards; defaults to `MICRO_ADS`
- **`HomeFeedAdSlot.tsx`** — multi-kind feed ticker that rotates between three content types: `spon` (Firestore `homepage_feed` ads via `useAdvertisements`), `community` (top-5 threads by `upvoteCount` fetched from Firestore on mount, hidden threads filtered client-side), and `gnews` (tech headlines from GNews API with 24 h `localStorage` cache + 60 min backoff on 429). Rotates on a 4.2 s interval; shows a skeleton while loading; degrades gracefully when any source is unavailable; clicking a community item navigates to `/community` with `state.openThreadId`
- **`Marketplace/MarketplaceAdCard.tsx`** — sponsored card shaped like a `ListingCard` (glass panel, 4:3 image with `campaign` icon fallback, SPONSORED badge, sponsor name + tagline, "Learn more" CTA → `targetUrl`); Firestore-backed via `useAdvertisements('marketplace_grid')`. Accepts a `featured?: boolean` prop that renders an amber "FEATURED" badge (top-left, separate from the SPONSORED badge). `MarketplacePage` interleaves these into the classifieds grid (all-view only): **4 featured ads → 6 listings → 4 normal ads → remaining listings**, computed via `isFeaturedActive()` (not the raw `featured` flag, so an expired featured run drops out live); degrades gracefully with <4 featured ads, no ads, or <6 listings

**Ad placements** (the `placement` string on each `advertisements` doc, managed in `AdsManagerPanel`): `banner`, `homepage_feed`, `marketplace_grid`, `listing_card`, `thread_card`.

**`AdsManagerPanel.tsx`** — admin CRUD interface for `advertisements` documents; now includes ImgBB image upload directly in the create/edit form (file picker → blob preview → upload on save, `VITE_IMGBB_API_KEY` required); URL revoked on cancel/change to avoid memory leaks; existing `imageUrl` shown as preview when editing without re-uploading; search/filter panel to find ads by title or sponsor name. `FeaturedControl` (local component) replaces the old featured checkbox: not-featured ads show a 7/14/30-day duration `<select>` + "Feature" button that writes `featured: true` and `featuredUntil` (`Timestamp.fromDate(now + N days)`); a currently-featured ad shows its expiry date and a click clears both fields. `toggleFeatured(ad, days?)` is the sole write path for the flag — the create/edit form no longer has a featured checkbox, since featuring always needs a duration and is set from the list view.

**Static data (`src/data/sponsoredAds.ts`):**
- `SponsoredAd` interface: `id`, `imageUrl`, `targetUrl`, `altText`, `sponsorName`, `tagline`, `accent`
- `BANNER_ADS` — 4 ads (ASUS ROG, Corsair, NZXT, EVGA)
- `MICRO_ADS` — 4 ads (Kingston, Seagate, be quiet!, Gigabyte)

### AI Chat System (`src/components/AI/`)

`AIChatPanel` renders as a React fragment so its three columns are direct flex children of `ChatPage`'s `<main>` container (which is `display:flex flex-row`):
- **Left** — Session history sidebar backed by `useAISessions`; lists saved sessions (title + timestamp); "NEW SESSION" button calls `resetSession()` + `crypto.randomUUID()`; clicking a session loads it via `loadSession(messages, activeBuild)`
- **Center** — terminal-styled chat with streaming token output, mic button (Web Speech API), Enter-to-send
- **Right** — `BuildCanvasCard` showing live extracted build components + power budget check

**Data flow:**
1. `useAIAssistant.sendMessage` POSTs to `${VITE_AI_SERVICE_URL}/api/chat` with the **last 12 messages** (`.slice(-12)` — the backend re-derives the build from `activeBuild` each turn, so full history is wasted tokens) + `activeBuild` context. Attaches a Firebase ID token when signed in (`getIdTokenForRequest()`), but degrades to anonymous access when signed out — `POST /api/chat` uses `optional_auth` (verifies the token if one is present, never requires it), so guests can use the AI assistant without signing in
2. Response is consumed as a raw byte stream via `liveStream()` (no SSE framing)
3. Any ` ```json { "build": {...} }``` ` block in the response is parsed by `extractBuild()` — which takes the **last** fence in the accumulated stream (a stray earlier fence in the model's prose is never mistaken for the authoritative, code-built one) — and **replaces** `activeBuild` state entirely rather than merging it (the backend always serialises the complete current build each turn, so a shallow merge could never reflect a slot the user asked to remove). `stripBuildFence()` removes the completed JSON fence from the **rendered** prose (the raw `accumulated` stream still keeps it so `extractBuild()` can parse it) — a partial/mid-stream fence isn't hidden until it closes
4. If the request errors out client-side (network failure, or the `VITE_AI_REQUEST_TIMEOUT_MS`-bounded abort, default 60 s), falls back to `MOCK_RESPONSE` streamed locally at ~22ms/token. A reachable-but-erroring server (401/429/422/503/other) surfaces a real, specific message instead — it is never conflated with the offline mock
5. `ChatPage` passes `location.state.initialMessage` for deep-linking into a pre-populated chat
6. When streaming ends, `AIChatPanel` auto-saves the session via `useAISessions.saveSession()` with a generated title
7. "Generate PC Part Picker List" button calls `formatPartsList()` — formats `activeBuild` as a readable list (functional)
8. "Share Build" opens `/share?build=<encoded>` in a new tab via `openSharePage()` — encodes `activeBuild` as `btoa(encodeURIComponent(JSON.stringify(build)))`

`sendMessage` uses refs (`messagesRef`, `activeBuildRef`, `isStreamingRef`) to access latest state without adding them as `useCallback` dependencies — keeping the function identity stable.

`ActiveBuild` has **7 slots**: `cpu`, `gpu`, `motherboard`, `ram`, `psu`, `storage`, `case` (the last two added so the AI can propose a complete parts list — see the `hybrid_fill_node` / expanded pipeline below).

**`BuildCanvasCard`** tracks all 7 slots (CPU, GPU, Motherboard, RAM, PSU, Storage, Case). Calculates power budget as `cpuTdp + gpuTdp + 150W buffer` vs `psu.rating`. Shows live estimated total cost.

### Shared Build Page (`src/pages/SharedBuildPage.tsx`)

Standalone read-only page at `/share?build=<base64>`. The `build` query param is `btoa(encodeURIComponent(JSON.stringify(activeBuild)))`.

Features:
- **Component cards** — one card per populated slot (CPU, GPU, Motherboard, RAM, PSU, Storage, Case); click opens a detail modal (`COMPONENT_CONFIG` is keyed by every `ActiveBuild` slot — add new slots here in lockstep with the interface)
- **Component detail modal** — full spec sheet, power badge (TDP/rating), YouTube review search link (Gamers Nexus / Hardware Unboxed / LTT), PCPartPicker search link
- **Power speedometer** — SVG semicircular gauge showing PSU load % with colour zones (green < 80%, amber 80–100%, red > 100%)
- **Total cost panel** — sum of all component prices
- **Copy build list** — formats build to plain text and copies to clipboard
- **"Build with Neuro AI"** — links back to `/chat`
- No Navbar/Footer/auth required; shows an error state for invalid/missing `?build=` params

### Admin System (`src/pages/AdminPage.tsx` + `src/components/Admin/`)

Admin-only workspace at `/admin`. Requires auth + `role: 'admin'` in `users/{uid}` (checked via `useAdminRole()`). Tabbed sections (tab order: Review Queue → Platform Moderation → Analytics → **Market Intel** → Role Management → Blog Automator → Ads Manager → Telemetry):

**MarketIntelPanel.tsx** — Weekly GenAI market-intelligence dashboard (`src/components/Admin/`)
- "Run Analysis Now" button (+ mock toggle) → `POST /api/admin/market-intel/run` with a Firebase ID-token Bearer header; loads the latest snapshot via `GET /api/admin/market-intel/latest`
- Renders the AI market brief, week-over-week price movements (▲/▼ Δ%), hot products (demand velocity), stale inventory, and per-category price ranges
- Backed by the MongoDB `market_intel` collection (see Market Intelligence System)

**ReviewConsole.tsx** — Blog post moderation queue
- Uses `useReviewQueue` — server-side filtered snapshot; posts vanish from the queue the moment they are approved or rejected in Firestore
- Inline title/content editing before approval
- Approve → `approvePost(id, publishAt?)` — immediate publish or scheduled
- Reject → `rejectPost(id, note)` — reverts to draft with `rejectionNote` shown to author

**ModerationDesk.tsx** — User-reported content + account appeals
- Real-time list of `reports` collection, filterable by Open / Resolved / All
- Report columns: Reporter, Reason, Target, Type, Date, Actions; `targetType` badge styled per type (`listing` cyan, `thread` purple, `user` red)
- Listing/thread reports: `hideTarget(targetId, targetType)` sets `status: 'hidden'` on the target; `resolveReport(id)` closes the report; "View Target" navigates to the listing/thread/seller profile page
- **User reports** (`targetType: 'user'`): "Disable account" action calls `useAdminModeration.setAccountStatus(uid, 'disabled', reason)` (confirm dialog) — hides the seller's active listings server-side; cannot self-disable
- **Repeat Offenders banner** — `useMemo` aggregates open-report counts per `targetId`; targets with ≥ 3 open reports surface at the top as a red "Repeat Offenders" panel with quick-action buttons; threshold is `SPAM_THRESHOLD = 3`
- **Account Appeals** banner at top — open `appeals` (via `useAppeals`); "Re-enable" calls `setAccountStatus(uid, 'active')` then `resolveAppeal`; "Dismiss" resolves the appeal without reinstating

**AnalyticsDashboard.tsx** — Platform trends (horizontal bar charts)
- Most Commented blogs — from `useBlogFeed(true)` sorted by `commentCount`
- Top Categories by upvotes — from `useCommunity()` grouped by `category`
- Most Saved listings — from `useMarketplace()` sorted by `savedBy.length`

**RoleAssignmentMatrix.tsx** — User role management
- Fetches all users from Firestore `users` collection on mount (one-time `getDocs`), sorted alphabetically by `displayName || username || uid`
- Filter by display name, `@username`, or email via a single search input (strips leading `@`)
- Shows `username` column (`@handle` or `—`); reassign role (`user` → `vendor` → `moderator` → `admin`) via `POST /api/admin/users/{uid}/role`

**BlogAutomatorPanel.tsx** — AI blog generation control panel (tab 5)
- Trigger the Actor-Critic blog pipeline (research → draft → critique loop → HITL publish)
- Monitor live job status and critique scores; mock mode available for UI testing without LLM calls

**TelemetryPanel.tsx** — Thesis evaluation instrumentation (tab 6)
- Auto-refreshes every 2 s from `telemetry.getMetrics()` singleton (sessionStorage-backed)
- **AI Performance** — avg latency, avg TTFT, P95 latency, mock fallback rate, avg character count
- **Cache Performance** — YouTube and GNews hit/miss ratios with progress bars
- **Compatibility Validation Catches** — per-check-type counts with error/warning severity badges; check types: `socket_mismatch`, `psu_margin`, `bios_flash`, `ram_mismatch`, `bottleneck`, `upgrade_path`, `budget_exceeded`
- **Recent Event Log** — last 25 events across all three event kinds, sorted newest-first
- Export JSON button downloads a `neurobuilds-telemetry-<ts>.json` snapshot; Clear Data requires double-confirm

### Blog System (`src/components/Blog/`)

**Blog post lifecycle (workflow states):**
```
draft → pending_review → published   (approve, immediate)
                      → scheduled    (approve with future publishAt)
pending_review → draft               (reject, adds rejectionNote)
```

- `useBlogFeed(isAdmin)` — real-time `onSnapshot`; public sees `isPublished=true` only; admin sees all statuses
- `useAdminRole(uid)` — single Firestore doc read on `users/{uid}`; `role: 'admin'` required
- `useBlogComments(postId)` — real-time `onSnapshot` on `blogs/{postId}/comments` (asc by `createdAt`); `addComment` / `deleteComment` use Firestore transactions to keep `commentCount` in sync
- `BlogEditor.tsx` — rich editor for creating/editing posts (admin-only); supports categories, status, scheduled publish date, featured image URL, YouTube video link
- `BlogPostModal.tsx` — read view for a single post; markdown rendering (headers, bold, italic, code, blockquotes, lists), featured image, embedded YouTube video, and `BlogComments`
- `BlogComments.tsx` — per-post comment thread; shows author initials + `timeAgo` timestamp; delete own comments
- `excerpt` is auto-derived from `content` (first 160 chars, markdown stripped) on create/update

**Extended `BlogPost` fields** (additions beyond the original schema):
```
status: 'draft' | 'pending_review' | 'scheduled' | 'published'
authorType: 'user' | 'ai_agent'
publishAt?: Timestamp | null
commentCount: number
rejectionNote?: string
thumbnailUrl: string
category: 'Tutorial' | 'Hardware' | 'Industry'
videoUrl?: string
```

### Real-time P2P Chat System (`src/components/Chat/`)

Supports 1:1 DMs and group conversations.

**Firestore schema:**
```
conversations/{id}
  participants: string[]   ← [buyerUid, sellerUid] for DMs; multiple UIDs for groups
  listingId?, listingTitle?, listingImage?   ← set for marketplace DMs
  isGroup?: boolean, groupName?: string
  lastMessageText, updatedAt

  messages/{id}
    senderId, senderName, text, createdAt
```

**Components:**
- **`ChatSidebar.tsx`** — composite container; manages conversation selection, message subscription, unread state, modal triggers for group creation; integrates `ConversationList` and `ChatWindow`
- **`ConversationList.tsx`** — left sidebar listing all conversations with search; supports starting new DMs by username lookup and creating group chats via `CreateGroupModal`
- **`ChatWindow.tsx`** — message bubbles with author names, timestamps, auto-scroll; expandable textarea; Enter-to-send
- **`CreateGroupModal.tsx`** — group creation modal; enter group name + add members by username (resolved via `usernames/{username}`); validates no duplicates

**Required Firestore composite indexes:**
- `conversations`: `participants` (Array) + `updatedAt` (Desc)
- `conversations`: `participants` (Array) + `listingId` (Asc)

"Message Seller" in `ListingDetailModal` → `ChatContext.startOrGetConversation` (deduplicates by user+listing) → opens `ChatSidebar`.

### Marketplace System (`src/components/Marketplace/`)

**Firestore schema** (`listings` collection):
```
title, description, price, negotiable, category
condition: 'new' | 'used' | 'refurbished'
listingType: 'sell' | 'buy' | 'exchange'
images: string[]          ← ImgBB URLs (uploaded via src/utils/imageUploader.ts)
country, location
sellerId, sellerName, sellerContact
status: 'active' | 'sold' | 'reserved' | 'hidden' | 'expired'   ← 'hidden' by moderation; 'expired' by listings_maintenance sweep
expiresAt?: Timestamp     ← set at create time to postedDate + 30 days; queried by the hourly sweep
tags: string[], specs: Record<string, string>
views, savedBy: string[]
sku?: string, stockQty?: number   ← vendor inventory fields
postedDate: Timestamp
```

**Layout** (`MarketplacePage.tsx`, all-view): on large screens (`lg:`) all filter controls live in a sticky **left sidebar**; the classifieds grid fills the right column. On mobile the same controls collapse behind a "Filters & Sort" toggle. `mine`/`saved` views stay full-width with a simple search bar.

**Components:**
- **`MarketplaceControls.tsx`** — vertical control rail (search, province/city/area cascade, category list, sort, listing-type, price range, condition, quick filters). Single source of truth rendered both in the desktop sidebar and inside the mobile collapsible panel
- **`MarketplaceAdCard.tsx`** — sponsored ad card interleaved into the grid (see Ads System)
- **`CreateListingModal.tsx`** — full listing create/edit form; title, description, price, condition, listing type, location (country/city/area via `GLOBAL_LOCATIONS`), category, up to 6 ImgBB-uploaded images, SKU/stock quantity for vendors
- **`ListingCard.tsx`** — grid preview card with thumbnail, price, condition badge, save toggle. Wrapped in `React.memo`; `onClick`/`onSave` receive the listing back so `MarketplacePage` can pass stable `useCallback` handlers (inline closures would change identity every render and defeat the memo). `MarketplacePage` also debounces `filters.search` by 250 ms into `debouncedSearch` before feeding the filter/sort `useMemo`, so a keystroke doesn't recompute the whole grid
- **`ListingDetailModal.tsx`** — full detail view; image gallery, seller info with contact reveal, view tracking (excludes self-views), `VideoReviewCarousel`, save/contact/edit/delete actions, "Report" button (opens `ReportModal`). Contact reveals are logged to the `listings/{id}/contactReveals/{viewerId}` subcollection (readable only by the listing owner/admin) so the seller can see who accessed their details
- **`VideoReviewCarousel.tsx`** — YouTube review carousel; lazy-loads iframe on thumbnail click; backed by `youtubeService.ts`
- **`SellerVerificationModal.tsx`** — seller activation flow: **step 0** is a required marketplace-rules agreement (renders `MARKETPLACE_RULES` from `src/data/marketplaceRules.ts`; checkbox gate; stamps `users/{uid}.rulesAcceptedAt`), then the two-step phone OTP verification (phone → 6-digit code)
- **`ReportModal.tsx`** — report a listing or its seller; reason dropdown + free-text details + optional ImgBB proof screenshot; calls `useReports.createReport` with `targetType: 'listing' | 'user'` and `proofUrl`; opened from `ListingDetailModal` (non-owner, signed-in)
- **`InventoryManager.tsx`** (in `Dashboard/`) — vendor-only table of active listings with real-time stock quantity increment/decrement controls and out-of-stock warnings

Images upload to **ImgBB** via `src/utils/imageUploader.ts` (`uploadImageToImgBB`). Up to 6 images per listing. Requires `VITE_IMGBB_API_KEY`. Client-side filtering in `getFilteredListings()` — all active listings fetched once on mount.

**Seller verification** (`useSellerVerification`): phone → OTP flow. Calls `POST /api/verify/request` (generates a cryptographically random 6-digit OTP, stores it in Firestore `phone_verifications/{uid}` with a 5-minute TTL, dispatches it via the WhatsApp gateway) and `POST /api/verify/confirm` (validates the OTP with constant-time comparison, writes `{ isVerified: true, phoneNumber }` to `users/{uid}`). Requires the WhatsApp gateway (`backend/whatsapp-gateway/`) to be running.

### Community System (`src/components/Community/`)

**Firestore schema:**
```
threads/{id}
  title, body, authorId, authorName, country, category
  upvoteCount, upvotedBy[], downvotedBy[], replyCount
  status: 'active' | 'hidden'   ← 'hidden' set by moderation
  createdAt

  replies/{id}
    body, authorId, authorName, parentId, createdAt
```

**Components:**
- **`CreateThreadModal.tsx`** — thread create/edit form; title, body, category (5 predefined), country, optional linked blog post, up to 4 ImgBB images
- **`ThreadCard.tsx`** — list-view card with title, author, vote counts, reply count, status badge (open/solved/archived)
- **`ThreadDetailModal.tsx`** — full thread view; nested reply tree (depth ≤ 3); upvote/downvote via Firestore transactions; lifecycle status management (authors mark solved, mods close); reply composer with 2-image support
- **`ReplyItem.tsx`** — depth-aware indented reply renderer; highlights own replies; reply-to-reply button

Voting via Firestore transactions. Real-time via `onSnapshot`.

### Dashboard (`src/components/Dashboard/Dashboard.tsx`)

Three real-time Firestore `onSnapshot` subscriptions fire in parallel on mount. A `pendingRef` counter decrements each time one fires; the skeleton loading state resolves when all three complete.

- **My Listings** — `listings` where `sellerId == uid`, sorted by `postedDate` descending; vendors also see `InventoryManager` for stock control
- **Saved Listings** — `listings` where `savedBy` array contains `uid`
- **My Threads** — `threads` where `authorId == uid`, sorted by `createdAt` descending

Renders `AccountStatusBanner` at the top (visible only when the user's `accountStatus == 'disabled'`). Redirects unauthenticated users to `/`.

### Moderation System

**Firestore schema** (`reports` collection):
```
reporterId, reporterName
reason: string
targetId, targetTitle
targetType: 'listing' | 'thread' | 'user'
proofUrl?: string          ← optional ImgBB proof screenshot
status: 'open' | 'resolved'
createdAt
```

`useReports()`:
- Real-time `onSnapshot` ordered by `createdAt` desc
- `createReport(data)` — any authenticated user submits a report (strips `undefined` keys before write; logs `report.create` audit entry)
- `resolveReport(reportId)` — admin marks resolved
- `hideTarget(targetId, targetType)` — sets `status: 'hidden'` on the target document in `listings` or `threads`

**Account moderation** (disable/appeal flow):
- `appeals` collection: `{ uid, displayName, message, status: 'open' | 'resolved', createdAt }`. A disabled user files one appeal; `useAppeals` (admin-only read) feeds the appeals banner in `ModerationDesk`
- `users/{uid}.accountStatus` (`'active' | 'disabled'`) + `disabledReason` — written **only** server-side by `POST /api/admin/users/{uid}/account-status` (`routers/admin_users.py`); disabling also batch-hides the seller's active listings. The Firebase Auth login is deliberately left enabled so the user can still sign in to read the notice and appeal
- `AccountStatusBanner.tsx` (Dashboard) — shown when the signed-in user's `accountStatus == 'disabled'`; surfaces `disabledReason` and lets them file a single appeal

**Audit trail** (`audit_logs` collection, `src/utils/auditLog.ts`): append-only, immutable (see `firestore.rules`). `writeAuditLog(actorId, action, meta)` is fire-and-forget. Actions: `listing.create/update/delete/contact_reveal`, `moderation.hide_target/resolve_report/disable_account/enable_account`, `report.create`, `appeal.create`.

### Services (`src/services/`)

**youtubeService.ts** — YouTube review discovery
- `fetchComponentReviews(componentName)` — searches YouTube Data API v3 for Gamers Nexus / Hardware Unboxed / LTT reviews
- Returns up to 3 `VideoItem` objects: `{ videoId, title, channelTitle, thumbnail }`
- 24-hour `sessionStorage` cache per component name
- Falls back to empty array if `VITE_YOUTUBE_API_KEY` is absent or request fails

### Utilities (`src/utils/`)

**datetime.ts** — shared relative-time formatters (replaces the per-file `timeAgo`/`formatRelativeDate` copies that were duplicated across components/hooks):
- `timeAgo(value)` — compact relative time ("just now", "5m ago", "3h ago", "2d ago"); accepts an ISO string **or** a Firestore `Timestamp` (or null/undefined → `''`)
- `formatRelativeDate(dateStr)` — calendar-style ("Today", "Yesterday", "3d ago", "2w ago", then "Mon D"); used by `ListingCard`
- `useCommunity.ts` re-exports `timeAgo` (`export { timeAgo } from '../utils/datetime'`) for back-compat with existing `import { timeAgo } from '../hooks/useCommunity'` call sites

**firestore.ts** — `tsToISO(v)` — normalises a Firestore field (`Timestamp` | string | null/undefined) to an ISO date string; replaces the `x instanceof Timestamp ? x.toDate().toISOString() : String(x ?? '')` pattern duplicated across the doc converters in `useMarketplace`/`useCommunity`

**imageUploader.ts** — `uploadImageToImgBB(file)` → ImgBB public URL. Requires `VITE_IMGBB_API_KEY`.

**usernameValidator.ts** — username lifecycle:
- `isValidUsernameFormat()` — 3–20 chars, alphanumeric + dots, no consecutive dots
- `checkUsernameAvailable()` — reads `usernames/{username}` shadow doc
- `claimUsername()` — atomic `writeBatch`: writes `usernames/{username}` + updates `users/{uid}.username`; releases old username if present

**userLookup.ts** — resolve usernames to UIDs and fetch public profiles:
- `resolveUsernameToUid(username)` — reads `usernames/{username}` (strips `@` prefix)
- `getUserProfile(uid)` — returns `{ displayName, username }` from `users/{uid}`

**scoringEngine.ts** — multi-persona PC build scoring:
- `scoreBuild(build, persona?)` — returns `BuildScores` with 5 sub-scores: performance-per-rupee, compatibility confidence, thermal efficiency, upgrade potential, power efficiency
- `detectPersona(build)` — auto-detects `gaming | productivity | budget` from price/specs
- Persona-weighted aggregation; pure calculation — no Firestore access
- `spec()` coerces every value to a string before use — `specs` is typed `Record<string, string>` but DB-sourced builds (`backend/scripts/ingest_hardware.py`) store several fields (`cores`, `cuda_cores`, `tdp_w`, etc.) as raw numbers, and every call site here (`parseNum`, `.toLowerCase()`, `.toUpperCase()`) requires an actual string

**telemetryTracker.ts** — session-scoped instrumentation singleton (`telemetry`):
- Persisted in `sessionStorage` under `nb_telemetry_v1`; survives page refresh within a session; capped at 100 events per type
- `recordAIRequest(event)` — called by `useAIAssistant` after each streaming response; captures `requestId`, `promptSnippet`, `startedAt`, `timeToFirstTokenMs`, `totalDurationMs`, `characterCount`, `isMockFallback`
- `recordCacheEvent(event)` — called by `youtubeService.ts` and `NewsFallback` on each cache hit/miss; `cacheType: 'youtube' | 'gnews'`
- `recordValidation(event)` — called by `useAIAssistant` after parsing a completed response; severity: `'error' | 'warning'`
- `parseValidationsFromResponse(text)` — applies 7 conservative regex patterns against the AI response text to detect compatibility events; de-duplicates within a single response
- `getMetrics()` — derives `TelemetryMetrics`: aggregated latency stats (avg, TTFT avg, P95), mock fallback rate, per-source cache hit ratios, per-check validation counts
- `exportJSON()` / `clear()` — used by `TelemetryPanel` for export and reset

### Location & News

- `src/data/globalLocations.ts` — `GLOBAL_LOCATIONS` (country → province → city hierarchy) + `COUNTRY_ISO` (country name → ISO code for GNews)
- `src/data/pakistanLocations.ts` — `PAKISTAN_LOCATIONS` — city → neighbourhood lookup (10 cities × 7–12 areas) for Pakistan-specific marketplace location selection
- `src/data/pakistanGeoLocations.ts` — `PAKISTAN_GEO_LOCATIONS` — area-level GeoJSON centroids (lat/lng) for Islamabad, Lahore, Karachi, Peshawar, Quetta, Gilgit, Muzaffarabad; mirrors `backend/services/location_search.py`'s `_AREA_CENTROIDS` dict; used by the frontend to display map markers and feed coordinates to the geo-fallback API
- `NewsFallback` component (`src/components/NewsFallback/`) — shown when no listings/threads exist for the selected country; fetches top-6 tech headlines from GNews API; 24-hour `localStorage` cache; rate-limit detection (60-min backoff on HTTP 429); requires `VITE_GNEWS_API_KEY`

### Error Boundary (`src/components/ErrorBoundary.tsx`)

Class component wrapping the entire app. On uncaught render error:
- Renders cyberpunk-themed "CRITICAL SYSTEM FAULT" UI with error message in `font-mono` block
- Two actions: "RETURN TO BASE" (reload to `/`) and "RETRY" (reset error state)
- Logs errors to console

### Contexts

| Context | File | Purpose |
|---------|------|---------|
| `CountryContext` | `src/context/CountryContext.tsx` | Global country selection, persisted to `localStorage` (`nb_country`) |
| `ChatContext` | `src/context/ChatContext.tsx` | P2P chat sidebar state, active conversation, `startOrGetConversation` |
| `ThemeContext` | `src/context/ThemeContext.tsx` | Dark/light theme toggle; persisted to `localStorage` (`nb_theme`); exposes `{ theme, toggleTheme }` via `useTheme()`; `ThemeProvider` wraps the entire app in `App.tsx` (outermost provider after `SplashScreen`) |

### Design System

Cyberpunk/neon glassmorphism. Defined in `tailwind.config.js` + `src/index.css`:
- **Colors**: `primary` (`#0df2f2` cyan), `accent-purple` (`#bf00ff`), `bg-dark` (`#1e1e1e`), `bg-panel` (`#252526`)
- **Key utilities**: `.glass-panel`, `.rounded-bento` (2rem radius), `.shadow-neon`, `.shadow-glow-purple`, `.scanline`
- **Font**: Space Grotesk. `text-xs`/`text-sm` are bumped ~1 px in `tailwind.config.js` (`xs` 12→13 px, `sm` 14→15 px) for readability
- **Z-index**: Navbar `z-50`, modals `z-50`, ChatSidebar backdrop `z-[60]`, ChatSidebar panel `z-[70]`

**Light mode** (`html:not(.dark)` in `src/index.css`): every Tailwind color utility is a hardcoded hex tuned for dark backgrounds, so light mode **remaps each one** (and its `hover:` / `group-hover:` / `focus-within:` variants — Tailwind emits separate class names per variant) to a darker ≥4.5:1-contrast equivalent (e.g. `text-primary` cyan → `#0e7490`, `text-X-400` pastels → their `X-700`/`X-800` family member). White-opacity backgrounds/borders flip to black-opacity; badge border tints are re-tinted. When adding a new accent colour used on text, add its light-mode override here or it will wash out on the lavender page background.

New UI should follow: backdrop blur, neon shadows on hover, dark panel backgrounds, `font-mono` for terminal/data text.

**Shared UI primitives:**
- **`SplashScreen.tsx`** — brief loading overlay shown unconditionally on every cold load; rendered outside all providers at the top of `App.tsx`; 300 ms entrance → 200 ms idle → 360 ms exit; unmounts at 860 ms; uses keyframe animations defined in `index.css` (`splashIconEnter`, `splashIconPop`, `splashRingEnter`, `splashRingPop`, `splashOverlayOut`)
- **`CyberSelect.tsx`** — cyberpunk-styled accessible dropdown (`role="listbox"`) that portals its option list via `createPortal(document.body)` to escape overflow-hidden containers; positions above or below the trigger depending on available viewport space; closes on outside click and any scroll; selected option shows a checkmark; exports `SelectOption` interface (`{ value, label }`)

### PWA Support

`vite-plugin-pwa` is configured in `vite.config.ts`. The app is installable as a standalone PWA with offline asset caching:
- **Cache strategy**: Images → CacheFirst (30 days), JS/CSS → StaleWhileRevalidate, Google Fonts → StaleWhileRevalidate
- **Icons**: `public/icons/icon-192x192.png`, `public/icons/icon-512x512.png` (maskable)
- **Manifest**: `public/manifest.json` — `short_name: NeuroBuilds`, `theme_color: #0d0e12`
- **Register type**: `autoUpdate` — service worker updates silently in background

### Firestore Security & Indexes

**`firestore.rules`** — security rules for all collections:
- `isAdmin()` checks the JWT custom claim `request.auth.token.admin == true` (set by `promote_admin.py` via Firebase Admin SDK) — zero extra Firestore reads, cannot be forged by a client
- `isModerator()` falls back to a Firestore doc read on `users/{uid}.role in ['moderator', 'admin']`
- Authenticated users can read/write their own subcollections (`aiSessions`, `notifications`); any signed-in user may push a notification into another user's subcollection
- `role`, `isVerified`, `phoneNumber`, `accountStatus`, and `disabledReason` fields in `users/{uid}` are immutable to non-admins (`isNotChangingTrustFields()` helper). `isVerified`/`phoneNumber` are written **only** server-side by `routers/verify.py`; `accountStatus`/`disabledReason` **only** by `routers/admin_users.py` — both via the Admin SDK (which bypasses rules), so a client cannot self-grant the verified badge or re-enable a disabled account
- `listings` create requires `isVerifiedSeller()` (a `get()` on the caller's `users/{uid}.isVerified == true`) **and** `isNotDisabled()` (caller's `accountStatus != 'disabled'`) — the seller-verification gate is enforced server-side, not just by the React modal overlay
- `listings` update is split into two `allow update` statements: the owner may update any field; **any** signed-in user may update via `isSavedByOnlyUpdate()` — a helper that only passes when the diff touches solely `savedBy` and the caller is adding/removing exactly their own uid (array size moves by 1, only that uid enters/leaves). Fixes a gap where the "save" heart toggle on a listing the caller doesn't own was silently rejected by rules, since the update rule previously required `sellerId == request.auth.uid` for every update including non-owner saves
- `listings/{id}/contactReveals/{viewerId}` — a buyer logs (under their own uid) that they revealed the seller's contact; readable only by the listing owner or an admin; immutable after create
- `appeals` — a disabled user may create an appeal attributed to themselves and read their own; admins read all + `update` (resolve); delete forever denied
- `threads` update rules are fine-grained: authors can edit content or mark `lifecycleStatus: 'solved'`; moderators can change `lifecycleStatus` only; anyone can make vote-only updates (`upvoteCount`, `upvotedBy`, etc.)
- `reports` writable by any authenticated user; `read, update, delete` restricted to admins only (moderators cannot read reports)
- `audit_logs` — append-only trail (§2.2.4): any signed-in user may create an entry attributed to themselves (`actorId == uid`, server `createdAt`); only admins may read; update/delete forever denied. Written by `src/utils/auditLog.ts` (`writeAuditLog`) on listing create + moderation actions (`hideTarget`, `resolveReport`)
- `blogs` read: published posts are public; admins see all; authors see their own regardless of status
- `blogs` update — `isCommentCountOnlyUpdate()` helper allows any signed-in user to increment/decrement `commentCount` (used by `addComment`/`deleteComment` Firestore transactions) without needing admin; clamps to non-negative integer
- `advertisements` — public read (ads render on public pages, incl. anonymous visitors); create/update/delete restricted to admins (`isAdmin()`). The `featured` flag is set here by `AdsManagerPanel`, the sole authoring surface

**`firestore.indexes.json`** — composite indexes:
- `blogs`: `isPublished` ASC + `createdAt` DESC
- `blogs`: `status` ASC + `publishAt` ASC (supports scheduled-post queries)
- `blogs`: `authorType` ASC + `createdAt` DESC (AI-agent post feed in `useBlogCMS`)
- `listings`: `country` ASC + `postedDate` DESC
- `listings`: `status` ASC + `postedDate` DESC (HomePage active-listings feed)
- `listings`: `country` ASC + `area` ASC + `status` ASC + `postedDate` DESC (area-level marketplace filtering)
- `listings`: `country` ASC + `city` ASC + `status` ASC + `postedDate` DESC (city-level marketplace filtering)
- `listings`: `sellerId` ASC + `postedDate` DESC (`SellerProfilePage` active-listings query)
- `listings`: `sellerId` ASC + `status` ASC + `postedDate` DESC (Dashboard "My Listings" filtered by active status)
- `listings`: `savedBy` (array-contains) + `postedDate` DESC (Dashboard "Saved Listings" query)
- `listings`: `status` ASC + `expiresAt` ASC (listings_maintenance expiry sweep)
- `conversations`: `participants` (array) + `updatedAt` DESC; `participants` (array) + `listingId` ASC
- `appeals`: `uid` ASC + `createdAt` DESC (a user's own latest-appeal lookup in `AccountStatusBanner`)

### FastAPI Backend (`backend/`)

The backend is a standalone Python service — **must be run separately** from the Vite dev server.

**Endpoints:**
- `GET /health` — returns `{"status": "ok", "service": "neurobuilds-ai"}`
- `GET /api/hardware/lookup` — searches `hardware_catalog` collection; requires `require_admin`
- `POST /api/chat` — accepts `{messages, activeBuild}`, returns a raw token stream (`text/plain`); auth is **optional** via `optional_auth` (verifies a Firebase ID token when the caller provides one, but allows anonymous/guest access when absent)
- `GET /api/marketplace/search` — public 3-tier cascading geo-fallback search (query params: `area`, `city?`, `limit?`)
- `POST /api/marketplace/search` — same search with richer filter body; requires `require_admin`
- `GET /api/admin/gemini/status` — returns whether `GOOGLE_API_KEY` is configured; requires `require_admin`
- `POST /api/admin/blog-automator/trigger` — queues AI blog generation pipeline; requires `require_admin`
- `GET /api/admin/blog-automator/jobs` — lists recent automator jobs newest-first; requires `require_admin`
- `POST /api/admin/users/{uid}/role` — assigns a role; sets BOTH `users/{uid}.role` AND the JWT `admin` custom claim (and revokes the target's refresh tokens) so the Firestore role and the rules' `isAdmin()` claim stay in sync; rejects self-demotion of the last admin; requires `require_admin` (`routers/admin_users.py`)
- `POST /api/admin/users/{uid}/account-status` — body `{ status: 'active' | 'disabled', reason? }`; sets `users/{uid}.accountStatus` (immutable to clients via rules) and, when disabling, batch-hides the seller's active listings; rejects self-disable; requires `require_admin` (`routers/admin_users.py`)
- `GET /api/components/reviews` — YouTube review proxy with server-side MongoDB TTL cache (24 hours — matches SRS §2.2.1 / UC-04); query param: `component` (e.g. `RTX 4070`); returns up to 3 `VideoItem` objects; falls back to empty array if `YOUTUBE_API_KEY` absent or on quota/403, in which case the frontend `VideoReviewCarousel` renders a "Search on YouTube" deep link; cache stored in `youtube_cache` collection with TTL index on `cachedAt` (migrated via `collMod` if a stale TTL exists); no auth required (`routers/components.py`)
- `POST /api/admin/market-intel/run` — body `{ mock?: bool }`; runs the market-intelligence analysis now (collect Firestore listings → deterministic aggregate → Gemini summary → persist) and returns the snapshot; requires `require_admin` (`routers/market_intel.py`)
- `GET /api/admin/market-intel/latest` — returns the most recent `market_intel` snapshot (or null); requires `require_admin` (`routers/market_intel.py`)
- `POST /api/admin/listings/sweep-expired` — manually triggers the listing expiry sweep (also runs hourly via background task); sets `status: 'expired'` on active listings past their `expiresAt` / older than 30 days; sends `listing_expired` notification to each seller; writes `listing.expired` audit log; requires `require_admin` (`routers/listings_maintenance.py`)

**Firebase Admin SDK** is initialised in the FastAPI lifespan handler. Set `FIREBASE_SERVICE_ACCOUNT_PATH` to a service-account JSON file. On GCP the env var may be omitted — Application Default Credentials are used as a fallback. Required by all `require_admin`-guarded endpoints; non-fatal at startup (admin endpoints return 503 until resolved).

**LangGraph pipeline** (`agent.py`) — a **deterministic router at `START`** (`route_request`, no LLM call) sends each turn down the cheapest capable path so follow-ups don't re-run three LLM calls + web search (which was causing multi-minute hangs):

```
                         ┌─ "build" → search → rag → market → intent → budget_allocation
                         │              → hybrid_fill → compatibility ─┐
START ─ route_request ──┤                                              ├→ (retry loop) → response → END
                         │  "edit"  → edit_node ─────────────────────────────────────→ response → END
                         └─ "chat"  → chat_node ───────────────────────────────────────────────→ END
```

- **`route_request`** → `'build' | 'edit' | 'chat'`. Uses keyword/signal heuristics: an existing build + an edit verb → `edit`; a strong build request or budget/resolution signal (and not a question) → `build`; otherwise `chat`. A bare "build" noun is treated as a question, not a new request.
- **build** — full pipeline. `budget_allocation_node` (Layer B, now `async`) fills slots from MongoDB; `hybrid_fill_node` (Layer A) then makes **one structured LLM call** to propose parts for any slot still empty and merges the proposal into **empty slots only** (deterministic DB picks always win). The proposal flows through `compatibility_node` exactly like a DB pick. Retry loop: `_should_retry` routes back to `budget_allocation` while `compat_ok=False` and `allocation_attempt < _MAX_ALLOC_ATTEMPTS` (=3), excluding the offending parts each pass. Whenever `hybrid_fill_node`/`edit_node` adds an LLM-proposed motherboard or RAM, `_enforce_socket_ddr_coherence()` deterministically overwrites its socket/DDR spec to match the already-chosen CPU/board — a prompt instruction to match specs isn't a guarantee, and an unmatched LLM-invented part could otherwise slip a fatal mismatch past `compatibility_node`'s guarded checks.
- **edit** — `edit_node` handles add/swap/remove on the existing build: removals are deterministic (keyword→slot), add/swap is one structured LLM call returning only the changed slots, then it re-runs `run_checks()` inline. No retry loop — a fatal edit sets `validation_failed=True` immediately.
- **chat** — `chat_node` is one conversational LLM call to gather requirements / answer questions; it never assembles a parts list.

**Hard validation gate (`validation_failed`):** when fatal issues survive the retry budget (build path) or a fatal edit occurs, `validation_failed=True`. `response_node` then uses a *validation-failure* system prompt that refuses to present the invalid build, and `run_pipeline` emits **no `json` build block** — an invalid build can never reach the BuildCanvas. `_serialise_build()` reduces `active_build` to the frontend `ActiveBuild` shape and is code-built (the LLM never hand-writes the block).

**Resilient LLM invocation** (`_ainvoke_resilient` / `_structured_resilient`): the free Gemini tier rate-limits hard, and the google-genai SDK retries `503` at the gRPC layer ignoring LangChain's timeout. So every Gemini call is wrapped in `asyncio.wait_for(_GEMINI_HARD_TIMEOUT)` and gated by a **circuit breaker** (`_gemini_cooldown_until`) — once Gemini fails, it's skipped for a cooldown and calls go straight to an optional **OpenAI-compatible fallback** (Groq by default, via `FALLBACK_LLM_*`; no-op if unconfigured / `langchain-openai` missing). `intent_node` / `rag_node` skip entirely during cooldown and use safe defaults. `search_node`/`rag_node` are also `asyncio.wait_for`-bounded (`SEARCH_TIMEOUT_S`/`RAG_TIMEOUT_S`, both run in threads). Structured build output avoids provider-specific JSON-schema modes: it prompts for JSON, extracts the first balanced object, and validates via the tolerant `BuildBlock`/`ProposedComponent` pydantic models (coerce `specs` strings→dict, TDP/price strings→numbers).

`run_pipeline` yields an immediate keep-alive cue ("🔧 Assembling your build…" / "Updating…") on the build/edit paths so the stream stays warm and the user gets instant feedback.

`market_node` reads the latest weekly `market_intel` snapshot from MongoDB (via `services.market_intel.read_latest` / `format_brief`) into `state.market_context`, a read-only reference block surfaced in `_build_deterministic_context()` under "MARKET INTELLIGENCE". Like the RAG/search context, `response_node` may cite it but must not do arithmetic on it. Reference blocks (search/RAG/market) are included only when they carry real content and are length-capped so they don't dominate the narration prompt. Degrades to "" when no snapshot exists.

**MongoDB timeout hardening**: every `MongoClient`/`AsyncIOMotorClient` sets `socketTimeoutMS` (env `MONGO_SOCKET_TIMEOUT_MS`, default `10000`) and `connectTimeoutMS` (5 s) — pymongo/Motor default to **no** socket timeout, so a mid-query network stall (an Atlas blip, a dropped connection) would otherwise hang the calling thread forever instead of raising, wedging the shared blocking-call thread pool (`asyncio.to_thread` / LangGraph's sync-node offload) one hang at a time until every blocking Mongo call in the process stalls too — the failure mode that causes the whole backend to go unresponsive until it's force-restarted. `budget_allocation_node` (now `async`) and `market_node` additionally wrap their Mongo reads in `asyncio.wait_for` (`MONGO_QUERY_TIMEOUT_S` / `MARKET_TIMEOUT_S`) on top of the socket timeout, and degrade gracefully (keep the existing build / empty market context) on timeout instead of propagating the error.

#### Deterministic / Probabilistic Architecture Split

This is the core architectural guarantee of the system. Every node belongs to exactly one layer, and the boundary between layers is enforced by the system prompt given to `response_node`.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    NEUROBUILDS AI PIPELINE ARCHITECTURE                 │
├─────────────┬────────────────────────────────┬────────────────────────  │
│   LAYER     │  NODE(S)                       │  WHAT IT MAY DO          │
├─────────────┼────────────────────────────────┼────────────────────────  │
│ A — LLM     │ intent_node                    │ Parse natural language → │
│ (semantic)  │                                │ structured BuildIntent.  │
│             │                                │ NO rules, NO arithmetic. │
├─────────────┼────────────────────────────────┼────────────────────────  │
│ B — Code    │ selection_node                 │ Budget math, price       │
│ (determin.) │                                │ breakdown, allocation    │
│             │                                │ ratios, efficiency score.│
│             │                                │ NO LLM calls.            │
├─────────────┼────────────────────────────────┼────────────────────────  │
│ C — Code    │ compatibility_node             │ Socket match, PSU        │
│ (determin.) │                                │ transient margin, RAM    │
│             │                                │ type, BIOS flash, tier   │
│             │                                │ bottleneck, upgrade path.│
│             │                                │ NO LLM calls.            │
├─────────────┼────────────────────────────────┼────────────────────────  │
│ D — LLM     │ response_node                  │ Narrate Layers B+C into  │
│ (narration) │                                │ educational prose. NEVER │
│             │                                │ recalculate or contradict│
│             │                                │ a deterministic report.  │
└─────────────┴────────────────────────────────┴────────────────────────  ┘
```

| Node | Layer | Type | Purpose | Fallback |
|------|-------|------|---------|---------|
| `search_node` | — | async | Tavily web search for live hardware prices (3 results); timeout-bounded, skipped without `TAVILY_API_KEY` | Empty string |
| `rag_node` | — | async | MongoDB Atlas vector similarity search on `hardware_specs`; thread + timeout-bounded, skipped during Gemini cooldown | Empty string |
| `market_node` | — | async | Reads the latest weekly `market_intel` snapshot; Mongo read offloaded to a thread with a hard timeout (`MARKET_TIMEOUT_S`) since it's a sync pymongo call inside an `async def` node | Empty string |
| `intent_node` | A | LLM (temp=0) | Extracts `BuildIntent`: budget, use_case, perf_target, brands, form factor; skipped during cooldown | Safe defaults |
| `budget_allocation_node` | B | async (offloads `run_allocation()` to a thread + `wait_for`) | Price breakdown, budget constraint check, allocation ratios, efficiency score; queries **`hardware_catalog`** (`MONGODB_CATALOG_COLLECTION`), not `hardware_specs` (wraps `selection_engine`) | "No priced components" |
| `hybrid_fill_node` | A | LLM (structured) | One call to propose parts for any **empty** slot; merges into empty slots only (DB picks win); LLM-proposed motherboard/RAM get their socket/DDR spec deterministically overwritten to match the CPU/board | Leave slots empty |
| `compatibility_node` | C | pure Python | 13-tier `run_checks()`; sets `compat_ok` + `validation_failed` after retry budget spent; surfaces `skipped` ("NOT VERIFIED") entries when a check couldn't run at all | "No active build" |
| `response_node` | D | LLM (streaming) | Narrates Layer B+C findings; picks build / edit / validation-failure system prompt | Degraded text |
| `chat_node` | — | LLM (streaming) | Lightweight conversational turn (no parts list) | Degraded text |
| `edit_node` | A+C | LLM + pure Python | Add/swap/remove specific slots, then re-validate inline | Keep build unchanged |

**`BuildIntent`** (output of `intent_node`, consumed by `selection_node`):
```python
{
  "budget_usd":       int | None,   # None if no budget stated
  "use_case":         str,          # gaming | workstation | budget | streaming | content_creation | general
  "preferred_brands": list[str],    # e.g. ["AMD", "NVIDIA"]
  "perf_target":      str,          # e.g. "1080p/144Hz", "video editing"
  "form_factor_pref": str,          # ATX | mATX | ITX | ""
}
```

**`BuildState`** TypedDict: `messages`, `active_build`, `search_context`, `rag_context`, `market_context`, `build_intent`, `selection_report`, `compatibility_report`, `compat_ok`, `validation_failed`, `allocation_attempt`, `excluded_components`, `response`.

**Streaming**: `run_pipeline()` uses `astream_events(version="v2")` and yields `on_chat_model_stream` events from the `response` **and `chat`** nodes only (the intent/hybrid_fill/edit structured calls are tagged with their own node names and filtered out, so they never leak into the reply). After streaming, it appends the code-built ` ```json {"build": …}``` ` fence (unless `validation_failed`). `main.py` wraps this in `StreamingResponse` with `media_type="text/plain"` and `X-Accel-Buffering: no`. The frontend consumes raw bytes directly — no SSE framing.

**System prompt** in `response_node` explicitly forbids the LLM from recalculating compatibility, performing price arithmetic, or contradicting any figure produced by `selection_node` or `compatibility_node`. It positions the LLM as a "translator, not a calculator." Two further rules close gaps found in testing: it must tell the user plainly when the compatibility report has a "NOT VERIFIED" section instead of implying the build is fully validated, and it must never name, price, or spec any component absent from the CURRENT BUILD STATE JSON block — closing a path where the model could invent a plausible-sounding but nonexistent component (e.g. a storage drive) to fill a narrative gap.

**Backend environment variables** (in `backend/.env`):

| Var | Purpose |
|-----|---------|
| `GOOGLE_API_KEY` | Gemini API key — used for LLM calls (`intent_node`, `response_node`, blog automator, market intel) and embeddings |
| `GEMINI_MODEL` | Defaults to `gemini-2.0-flash`; used in `intent_node`, `response_node`, and blog automator |
| `GEMINI_MAX_RETRIES` | LangChain retry cap per Gemini call (default `2`) |
| `GEMINI_TIMEOUT_S` | Hard wall-clock bound per Gemini call via `asyncio.wait_for` (`_GEMINI_HARD_TIMEOUT`; code default `12`, `.env.example` ships `40`) |
| `GEMINI_COOLDOWN_S` | Circuit-breaker cooldown after a Gemini failure before it's probed again (default `120`) |
| `SEARCH_TIMEOUT_S` / `RAG_TIMEOUT_S` | Wall-clock bounds on `search_node` (default `8`) and `rag_node` (default `8`) |
| `MONGO_SOCKET_TIMEOUT_MS` | Socket-level timeout (ms, default `10000`) on every Mongo client — pymongo/Motor default to none, so this bounds a mid-query network stall instead of letting it hang the calling thread forever |
| `MONGO_QUERY_TIMEOUT_S` | Wall-clock bound (default `10`) layered on top via `asyncio.wait_for` for `budget_allocation_node`'s DB query |
| `MARKET_TIMEOUT_S` | Wall-clock bound (default `6`) via `asyncio.wait_for` for `market_node`'s market-intel read |
| `FALLBACK_LLM_API_KEY` | Optional OpenAI-compatible fallback LLM used when Gemini is rate-limited / in cooldown; empty disables it. Requires `pip install langchain-openai` |
| `FALLBACK_LLM_BASE_URL` | Fallback base URL (default `https://api.groq.com/openai/v1`) |
| `FALLBACK_LLM_MODEL` | Fallback model (default `llama-3.3-70b-versatile`) |
| `ENABLE_SEMANTIC_CACHE` | `setup_semantic_cache()` is now **opt-in** (`true` to enable) — its lookup embeds every prompt via Gemini, sharing the small free-tier quota; when exhausted the lookup itself stalls ~90 s/call |
| `TAVILY_API_KEY` | Node 1 web search + blog automator research stage |
| `MONGODB_ATLAS_URI` | Node 2 vector store connection |
| `MONGODB_DATABASE` | Defaults to `neurobuilds` |
| `MONGODB_COLLECTION` | Defaults to `hardware_specs` |
| `MONGODB_VECTOR_INDEX` | Defaults to `vector_index` |
| `MONGODB_CATALOG_COLLECTION` | Defaults to `hardware_catalog` — used by `ingest_hardware.py` and `/api/hardware/lookup` |
| `MONGODB_MARKET_INTEL_COLLECTION` | Defaults to `market_intel` — weekly market-intelligence snapshots (`services/market_intel.py`); ~8-day TTL on `createdAt` |
| `MONGODB_LISTINGS_COLLECTION` | Defaults to `listings` — used by `GET /api/marketplace/search` |
| `CORS_ORIGINS` | Comma-separated allowed origins; defaults to `http://localhost:5173,http://127.0.0.1:5173` |
| `MONGODB_CACHE_COLLECTION` | Defaults to `semantic_cache` — used by `cache_manager.py`; requires a `semantic_cache_index` vector search index (768 dims, cosine) created manually in Atlas UI |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Path to Firebase service-account JSON; required by `require_admin` / `require_auth` dependencies; on GCP can be omitted (Application Default Credentials used) |
| `FIREBASE_PROJECT_ID` | Firebase project ID; only needed when `FIREBASE_SERVICE_ACCOUNT_PATH` is absent and ADC doesn't supply it |
| `WHATSAPP_GATEWAY_URL` | URL of the WhatsApp OTP gateway microservice; defaults to `http://127.0.0.1:3001` |
| `GATEWAY_SECRET` | Shared Bearer secret for the WhatsApp gateway `/send-otp` endpoint; must match `GATEWAY_SECRET` set in the gateway process |
| `YOUTUBE_API_KEY` | YouTube Data API v3 key used by the **backend** `GET /api/components/reviews` proxy; distinct from `VITE_YOUTUBE_API_KEY` (frontend direct-call fallback) |

MongoDB Atlas requires a Vector Search index named `vector_index` on the `embedding` field (768 dims, cosine — Gemini `text-embedding-004`). `GPU_Exhaustive_Database.csv` and `CPU_Exhaustive_Database.csv` (`misc/`) contain hardware data for reference.

### WhatsApp OTP Gateway (`backend/whatsapp-gateway/`)

Standalone Node.js microservice — delivers 6-digit OTPs via WhatsApp for seller phone verification. Not part of the FastAPI process; runs as a separate service.

**Architecture:**
- Uses `whatsapp-web.js` (headless Puppeteer) + `LocalAuth` for session persistence (`.wwebjs_auth/` directory)
- Auto-reconnect on disconnect with 5 s delay to avoid tight loops
- `GATEWAY_SECRET` env var gates `/send-otp` with `Authorization: Bearer <secret>` check; unset = no auth (dev only)

**Endpoints:**
- `GET /health` — returns `{ ready, status, service }` where `status` is one of: `initialising`, `awaiting_scan`, `authenticated`, `ready`, `auth_failure`, `disconnected`, `reconnect_failed`, `init_error`
- `POST /send-otp` — body: `{ phone: string (E.164, e.g. +923001234567), otp: string (6 digits) }`; validates both fields; returns `{ success: true }` or error with HTTP 400/503/500

**FastAPI integration:** `WHATSAPP_GATEWAY_URL` (default `http://127.0.0.1:3001`) and `GATEWAY_SECRET` in `backend/.env` wire the FastAPI backend to call this gateway for real OTP delivery (replacing the hardcoded mock OTP).

**First-run QR scan:** on first start the gateway prints a QR code in the terminal. Scan via WhatsApp → Settings → Linked Devices → Link a Device. Subsequent starts reuse the saved session.

### Ingestion Scripts

**`misc/scripts/ingest-rag.py`** — populates `hardware_specs` for RAG semantic search:
```bash
cd backend
python ../misc/scripts/ingest-rag.py
```
- Loads `GOOGLE_API_KEY` from `backend/.env`
- Generates embeddings with Gemini `text-embedding-004` (768 dims)
- Upserts GPU, CPU, motherboard, RAM, PSU specs into `hardware_specs` collection
- Creates `vector_index` on the `embedding` field if absent
- Uses hardcoded `HARDWARE_SPECS` list (CSVs not yet wired)

**`backend/scripts/ingest_hardware.py`** — populates `hardware_catalog` for `/api/hardware/lookup`:
- Merges hardcoded specs + GPU CSV + CPU CSV data
- Creates B-tree index on `name` + vector embeddings on `embedding` field
- Run before starting the backend if hardware lookup is needed

**`backend/scripts/ingest_rag_documents.py`** — idempotent RAG ingestion into `hardware_specs` (the collection `rag_node`/`VectorStoreEngine` query):
```bash
cd backend
python scripts/ingest_rag_documents.py                 # default JSON source
python scripts/ingest_rag_documents.py --source data/hardware_source.csv
python scripts/ingest_rag_documents.py --verify        # validate config + parse only (no network)
python scripts/ingest_rag_documents.py --dry-run       # parse + Mongo diff, no embeddings/writes
```
- Source: `backend/data/hardware_source.json` (default) or a structured CSV via `--source`; CPU/GPU rows only. Sample `hardware_source.json` + `hardware_source.csv` ship in `backend/data/`; exhaustive JSON datasets `hardware_source_cpu_exhaustive.json` and `hardware_source_gpu_exhaustive.json` also available in `backend/data/` for full-coverage ingestion
- Serialises each component into a LangChain `Document` (`langchain_core.documents`): pipe-delimited `page_content` spec string + flattened spec `metadata` (CPU: `socket/cores/threads/tdp_watts/integrated_graphics`; GPU: `vram_gb/interface/tdp_watts/power_connectors`)
- **Idempotency**: Mongo `_id` = SHA-256(`brand|model`); a `content_hash` skips unchanged docs (zero re-embedding) and upserts only new/changed ones
- **Async batch embedding**: `--batch-size` (default 64, 50–100 recommended) chunks, `--concurrency` (default 4) in flight via `GeminiEmbeddings` (768-dim); per-row + per-chunk try/except with structured logging — corrupt rows are skipped, not fatal
- Writes `content` + `embedding` so docs are immediately queryable; the Atlas `vector_index` (768 dims, cosine) must already exist

**`misc/csv-data/scrapper.py`** — TechPowerUP GPU database scraper:
- Two-phase scraping: chip discovery (horizontal) → custom board traversal (vertical)
- Extracts clocks, VRAM, AIB partner info; anti-bot throttling (5–10s delays)
- Output: `misc/GPU_Exhaustive_Database.csv`; versioned snapshots in `misc/gpu_specs_v6.csv` and `misc/gpu_specs_v7.csv`

### Backend Service Modules (`backend/services/`)

**`validation_engine.py`** — 13-tier deterministic compatibility matrix (Layer C):
- `run_checks(build, case?) → ValidationResult` — returns `{ ok, issues, warnings, passed, skipped }`
- Check tiers (fatal → `issues`, advisory → `warnings`): (1) PSU transient margin, (2) CPU↔MB socket, (3) BIOS flash advisory [warning], (4) RAM DDR type, (5) form factor fit, (6) GPU physical clearance, (7) CPU cooler height, (8) hardware bottleneck [warning], (9) platform upgrade path [**warning — never fatal now**, so a working-but-EOL board isn't excluded on retry], (10) storage interface fit (NVMe needs M.2), (11) PSU PCIe power connectors, (12) CPU cooler socket + TDP (reads an optional `cooler` slot), (13) PCIe generation [warning]
- `skipped` — fatal-tier checks (PSU transient margin, socket, RAM type) that could not run **at all** because a required field was missing on one or both sides. Distinct from "passed": a vacuous "no issues found" is not the same as a verified-compatible build, so these are surfaced to the user as "NOT VERIFIED" rather than silently reading as a pass
- **Spec-key tolerance layer** (`_spec()` / `_extract_ddr()`): the build dict is produced by five sources that disagree on key names (board memory type has been `max_memory` / `memory_type` / `ram_type`; RAM type `speed` / `type`; case GPU clearance `max_gpu_clearance_mm` / `max_gpu_length_mm`). Every spec is read through tolerant helpers so a fatal mismatch is never silently skipped because a field was spelled differently (this is what let the **DDR5-on-B550** bug slip through). Socket/DDR are additionally backstopped by name/chipset inference (`_socket_from_cpu_name`, `_PLATFORM_SOCKET`, `_PLATFORM_DDR`) so LLM-invented parts that omit an explicit spec are still checked. LGA1700 is intentionally absent from DDR derivation (ships in both DDR4 and DDR5).
- Re-exports `required_socket(cpu)` / `required_ddr(build)` for `selection_engine`'s compatibility pre-filter
- GPU transient multipliers: RTX 40-series ×1.25, RTX 30 ×1.15, RX 7 ×1.20, RX 6 ×1.10; safety factor 1.20×
- Pure Python, zero LLM/API calls; shared by `agent.py` nodes, ingestion scripts, and `tests/evaluation_suite.py`

**`selection_engine.py`** — deterministic budget allocation model (Layer B):
- `run_allocation(budget, use_case, build, collection, attempt, excluded) → AllocationResult`
- `ALLOCATION_WEIGHTS` — per-persona budget fractions: `gaming` (GPU 40%, CPU 20%, MB 12%, RAM 8%, PSU 8%), `workstation` (CPU 35%, GPU 30%, MB 15%, RAM 12%, PSU 8%), etc.
- Ceiling = `budget × weight × 1.15` margin; per-retry ceiling reduction on CPU/GPU when compatibility fails; excluded-names blacklist to skip incompatible components on retry
- **Compatibility pre-filter** (`_compat_filter`): constrains each candidate query to parts compatible with slots already chosen (motherboard socket must equal the CPU's `required_socket`; RAM DDR generation must equal `required_ddr`) — applied **before** ranking so Layer B never even considers, let alone selects, a known-incompatible part. Tolerant of the several memory-type spellings; returns `{}` (unfiltered) when the constraint can't be determined. When no compatible part fits the budget the slot is left empty for `hybrid_fill`/retry.
- MongoDB `performance_score`-ranked queries with a `specs.launch_msrp_usd`-DESC price-sort fallback (used whenever `performance_score` is absent from a matched doc — the current `hardware_catalog` seed data has no `performance_score` field, so every query currently takes this fallback path); builds human-readable report string for Layer D narration. Component `specs` use `launch_msrp_usd` / `tdp_w` / `wattage_w` field names, matching `ingest_hardware.py`'s schema — `validation_engine.py` reads through the same names
- Zero LLM calls; thin `budget_allocation_node` in `agent.py` wraps this (now `async` — offloads the blocking Mongo call to a thread with a hard timeout, see MongoDB timeout hardening above)

**`location_search.py`** — 3-tier cascading geo-fallback search:
- `LocationSearchService(collection).search(area, extra_filters?, radius_m?, limit?) → GeoSearchResult`
- `GeoSearchResult` carries `listings`, `tier` (1–3), `tier_label` (e.g. "Tariq Garden" / "Nearby Tariq Garden" / "All of Lahore"), `count`
- Tier 1: exact `area` field match; Tier 2: `$nearSphere` within 8 km of area centroid (requires `2dsphere` index on `geo` field); Tier 3: city-wide fallback
- Embeds `_AREA_CENTROIDS` dict (7 cities — Islamabad, Lahore, Karachi, Peshawar, Quetta, Gilgit, Muzaffarabad) that mirrors `src/data/pakistanGeoLocations.ts`
- `ensure_indexes(col)` — creates `2dsphere` + compound indexes; safe to call on every startup

**`market_intel.py`** — weekly GenAI market-intelligence engine (deterministic-then-narrate, Layer B → Layer D):
- `collect_listings(now)` — reads new (24 h) + active-corpus listings from Firestore via the Admin SDK
- `aggregate(new, corpus, prev_snapshot, now)` — **pure Python, no LLM**: per-category price ranges (min/median/avg/max), hot products (view velocity over recent listings), dead inventory (≥14 d old + ≤3 views), and price movements (current vs previous snapshot median → Δ% + direction)
- `summarize(aggregates, mock?)` — Gemini narration via `gemini_client.generate_text` (returns "" when no API key; `mock=True` uses a templated summary)
- `read_latest` / `write_snapshot` — MongoDB `market_intel` collection (env `MONGODB_MARKET_INTEL_COLLECTION`, default `market_intel`); `ensure_market_intel_index` sets an **~8-day TTL** on `createdAt` (one day past the weekly cadence so the prior snapshot survives for price-diffing; `collMod` migration on conflict)
- `run_market_analysis(client, db, *, mock, generated_by)` — full collect→aggregate→summarize→persist orchestrator; `format_brief(snapshot)` renders the compact brief consumed by `agent.py`'s `market_node`
- Driven by `routers/market_intel.py` (admin trigger + GET latest) and a weekly background `asyncio` loop started in `main.py` lifespan (`start_market_intel_loop`, needs both the Admin SDK and MongoDB)

**`listings_maintenance.py`** (`backend/routers/`) — 30-day listing auto-expiry:
- `run_expired_sweep()` — async function that sweeps active listings and flips them to `status: 'expired'`; two-pass: Stream 1 queries `expiresAt <= now` (new docs); Stream 2 falls back to `postedDate <= now - 30 days` (legacy docs without `expiresAt`); for each expired doc: updates status, writes a `listing_expired` notification to the seller's subcollection (via Admin SDK), and appends a `listing.expired` audit log entry with `actorId: 'system'`
- `start_background_sweep()` — long-running asyncio loop (hourly, sleeps first to avoid blocking lifespan); called once from FastAPI lifespan startup in `main.py`
- `POST /api/admin/listings/sweep-expired` — manual trigger for testing; requires `require_admin`
- `expiresAt` is stamped at listing create time by `useMarketplace.createListing` (`postedDate + 30 days` as a Firestore `Timestamp`); `MarketplacePage` renders a badge showing the expiry date on the seller's own listings view

**`cache_manager.py`** — MongoDB Atlas LLM semantic cache:
- `setup_semantic_cache(client, db_name)` — binds `MongoDBAtlasSemanticCache` globally so all LangChain LLM calls (`intent_node`, `response_node`) are auto-intercepted
- Cosine similarity threshold: 0.97 (tight — avoids false cache hits on different budgets)
- Collection: `semantic_cache`; index: `semantic_cache_index`; requires `langchain-mongodb`
- Silently no-ops if `OPENAI_API_KEY` absent, `langchain-mongodb` not installed, or Atlas unreachable — never blocks startup
- **Opt-in**: `main.py` only calls it when `ENABLE_SEMANTIC_CACHE=true`. Its lookup embeds every prompt via Gemini embeddings (shared, small free-tier quota); when that quota is exhausted the cache lookup itself stalls ~90 s/call — so it's disabled by default

**`auth_guard.py`** — FastAPI dependencies for Firebase JWT verification:
- `require_admin` — verifies Bearer token via Firebase Admin SDK + asserts `admin: true` custom claim; raises HTTP 401/403/503
- `require_auth` — same verification but accepts any valid non-revoked Firebase ID token (no admin claim check); raises HTTP 401/503
- `optional_auth` — verifies a Firebase ID token when the `Authorization` header is present, but returns `None` (never raises) when it's absent, invalid, or Firebase Admin isn't initialised — lets `POST /api/chat` serve both signed-in and guest users from the same route
- All three dependencies are used with `Annotated[str, Depends(...)]` (or `Annotated[str | None, Depends(optional_auth)]`) and return the verified UID

**`gemini_manager.py`** — Single-key Gemini client:
- `GeminiClient` — async wrapper; `generate_text(prompt, *, model, system_prompt, max_tokens, temperature)` and `embed_content(text)` both run `google-genai` SDK calls via `asyncio.to_thread()`
- Module-level singleton `gemini_client: GeminiClient | None` — initialised from `GOOGLE_API_KEY`; None when not set
- Used by `market_intel.py` and exposed via `GET /api/admin/gemini/status`. `blog_automator.py`'s draft/critique stages no longer call this directly — they go through `agent.py`'s `_ainvoke_resilient` instead (see below)

**`embeddings.py`** — `GeminiEmbeddings` — LangChain `Embeddings` subclass backed directly by the `google-genai` SDK:
- Lazy model resolution: tries `embedding-001` → `text-embedding-004` → `gemini-embedding-exp-03-07` on first call, caches the winner
- Used by `VectorStoreEngine` (replacing the previous inline embedding setup)

**`vector_store.py`** — `VectorStoreEngine` — wraps `MongoDBAtlasVectorSearch` with a shared injected `MongoClient` (zero extra connection pools):
- Uses `GeminiEmbeddings` from `services.embeddings`
- `ingest_documents(docs)` — embed + insert; `get_retriever(top_k)` — LangChain retriever; `similarity_search(query, top_k)` — direct search
- Accepts the `MongoClient` from `app.state.mongo` at construction; instantiated once in the FastAPI lifespan handler

### Blog Automator Router (`backend/routers/blog_automator.py`)

Python migration of the TypeScript `misc/blog-automator/` service into the FastAPI backend (the original TS project — a standalone Actor-Critic CLI pipeline — is retained under `misc/` for reference only and is no longer run). Draft/Critique LLM calls go through `agent.py`'s `_ainvoke_resilient` — the same Groq-primary / Gemini-fallback chain (with hard timeouts + circuit breakers) used by the AI build assistant, instead of calling `gemini_client` directly, so the automator doesn't compete with the build assistant for the small free-tier Gemini quota. All endpoints require `require_admin`.

**Pipeline stages:**
```
[1] Research  — Tavily web search (top 5 results, same TAVILY_API_KEY as agent.py)
[2] Draft     — writer LLM via `_ainvoke_resilient` (Groq primary, Gemini fallback; system prompt: SEO-optimised long-form, 1500–2500 words)
[3] Critique  — critic LLM via `_ainvoke_resilient` (same chain; JSON response: score 0–100, feedback[], requiresRevision)
               If score < 75 AND iteration < 2 → back to [2] with feedback
[4] Publish   — Creates Firestore `blogs` doc, status "pending_review", authorType "ai_agent"
               Admin reviews via existing ReviewConsole UI
```

**Firestore collections:**
- `blog_automator_jobs/{job_id}` — job state (stage, status, critiqueScore, critiqueHistory, blogId)
- `blog_automator_meta/config` — `.lastTriggeredAt` for the 12-hour anti-spam window

**Anti-spam:** `POST /trigger` checks `blog_automator_meta/config.lastTriggeredAt`; rejects with HTTP 429 if triggered within the last 12 hours.

**Mock mode:** `{ "mock": true }` in the trigger body uses hardcoded synthetic research/draft/critique data — no Tavily or Gemini calls; useful for UI testing.

**Extra Firestore fields on AI-generated blog posts:** `critiqueScore`, `critiqueHistory`, `automatorJobId`, `sourceTopic` (in addition to standard `BlogPost` fields with `authorType: 'ai_agent'`).

### Academic Evaluation Suite (`backend/tests/evaluation_suite.py`)

Standalone offline evaluation — no LLM calls, no network, no database required for Experiment 1.

```bash
cd backend
python tests/evaluation_suite.py
```

- **Experiment 1 — Compatibility Engine Accuracy**: runs `run_checks()` against a fixture of labelled builds (Known Good / Intentionally Broken, incl. LLM-key-schema regression cases like DDR5-on-B550 and no-explicit-socket variants); reports confusion matrix, Precision, Recall, F1 (currently 100% across the board)
- **Experiment 2 — Budget Allocation Adherence**: runs `run_allocation()` across gaming/workstation/budget persona builds; reports MAE, RMSE, within-±15% count, avg retries, avg slots filled versus `ALLOCATION_WEIGHTS` targets
- **Experiment 3 — Validation Gate + Selection Pre-Filter**: asserts the `validation_failed` hard gate (fatal build → `_should_retry` routes to `respond`, no infinite loop, build JSON suppressed) and that `selection_engine`'s `_compat_filter` picks a socket-matched board
- Imports directly from `services.validation_engine` and `services.selection_engine`

## Frontend Environment Variables

| Var | Required | Purpose |
|-----|----------|---------|
| `VITE_FIREBASE_API_KEY` etc. | Yes | Firebase config (6 vars) |
| `VITE_AI_SERVICE_URL` | No (defaults to `http://localhost:8000`) | FastAPI AI service base URL |
| `VITE_AI_REQUEST_TIMEOUT_MS` | No (defaults to `60000`) | Client-side abort timeout for `POST /api/chat` requests |
| `VITE_IMGBB_API_KEY` | For marketplace image uploads | ImgBB image hosting API |
| `VITE_GNEWS_API_KEY` | For news fallback | GNews top-headlines API |
| `VITE_YOUTUBE_API_KEY` | For video reviews | YouTube Data API v3 |

## Key Gaps / In-Progress Areas

- **Seller verification**: Fully wired **and enforced server-side**. `POST /api/verify/request` generates a real random OTP, persists it to Firestore `phone_verifications/{uid}` (5-min TTL), and dispatches it via the WhatsApp gateway (`backend/whatsapp-gateway/`). `isVerified` is immutable to clients (`isNotChangingTrustFields()`) and `listings` create requires `isVerifiedSeller()` in `firestore.rules` — the gate is no longer just the React modal overlay. Requires the gateway process to be running alongside FastAPI.
- **TOTP 2FA — removed**: The 2FA feature (TOTP enrollment in `ProfilePage` + MFA sign-in challenge in `AuthModal`) has been removed. The Firebase Spark (free) plan does not support TOTP MFA — enrollment failed with `auth/operation-not-allowed`. Re-enabling would require the paid Identity Platform upgrade and restoring the `multiFactor` / `TotpMultiFactorGenerator` re-exports in `src/Firebase.ts`.
- **MongoDB RAG data**: Run `scripts/ingest-rag.py` to populate the `hardware_specs` collection before the backend's `rag_node` can return results — it falls back gracefully until this is done.
- **CSV → RAG pipeline**: `GPU_Exhaustive_Database.csv` and `CPU_Exhaustive_Database.csv` exist but are not yet wired into `ingest-rag.py`; the script uses hardcoded specs instead.
- **`langchain-mongodb` package**: Listed as optional in `requirements.txt`; `rag_node` falls back to `langchain-community` if not installed.
- **Blog scheduled publishing**: `status: 'scheduled'` posts with a future `publishAt` are not auto-published — no cron or Cloud Function triggers the transition; currently requires manual admin action.
- **scoringEngine integration**: `src/utils/scoringEngine.ts` exists but is not yet wired into any UI component.
- **Notification triggers**: `writeNotification()` is exported but not yet called from marketplace/community/blog hooks — user-action notifications (new reply, new message, blog comment) are not yet generated. Exception: `listing_expired` notifications **are** sent server-side by `listings_maintenance.py` via the Admin SDK when the hourly sweep expires a listing.
- **LLM semantic cache**: `cache_manager.setup_semantic_cache()` is wired into `main.py` startup but is **opt-in** (`ENABLE_SEMANTIC_CACHE=true`) and requires a `semantic_cache_index` Atlas Vector Search index created manually before the first cached call.
- **Blog Automator UI**: `src/components/Admin/BlogAutomatorPanel.tsx` is wired into `AdminPage.tsx` as tab 5. Backend pipeline at `backend/routers/blog_automator.py` is live.
- **Location search API exposure**: `GET /api/marketplace/search?area=&city=&limit=` is live in `main.py`. The frontend still uses Firestore client-side filtering; wire it to this endpoint when ready.
- **`pakistanGeoLocations.ts` ↔ backend sync**: area centroids in `src/data/pakistanGeoLocations.ts` and `backend/services/location_search.py`'s `_AREA_CENTROIDS` are manually kept in sync — no automated check.
- **YouTube proxy vs client-side**: `GET /api/components/reviews` is a server-side YouTube proxy (7-day MongoDB TTL cache). The frontend `src/services/youtubeService.ts` still calls the YouTube API directly via `VITE_YOUTUBE_API_KEY`. Wire `ListingDetailModal` / `SharedBuildPage` to the backend proxy when ready to avoid exposing the API key client-side.
- **JS bundle size** — *resolved*: routes are now lazy-loaded via `React.lazy` + `Suspense` in `App.tsx` (only `HomePage` + layout chrome stay eager), and `vite.config.ts` splits `firebase` / `react-vendor` / `react-router` / `icons` into long-lived vendor chunks via `rollupOptions.output.manualChunks`. No chunk exceeds the 500 kB Vite threshold; ~350 kB of route code (Admin, Marketplace, Community, Chat, Blog, …) is deferred off the initial paint. Keep new pages lazy-imported in `App.tsx` to preserve this.

## Known Lint Errors & Technical Debt

**Build status**: TypeScript compiles clean (`tsc -b` passes) and ESLint is **clean (0 errors, 0 warnings)** as of the latest audit — the codebase has been cleaned up since the tables below were written, so most rows in the sub-sections that follow are now historical/resolved. Re-run `npm run lint` before treating any specific row as still-open.

> Regression fixed (this branch): adding `storage`/`case` to `ActiveBuild` broke `tsc` because `SharedBuildPage.COMPONENT_CONFIG` (a `Record<keyof ActiveBuild, …>`) no longer had every key — both slots were added there. Two pre-existing `tsc` breakers were also fixed at the same time: `MarketIntelPanel`'s `CategoryStat` was missing the `avgViews` field the backend already returns, and `ListingDetailModal` imported `updateDoc` without using it. Keep `SharedBuildPage.COMPONENT_CONFIG` and `BuildCanvasCard.ROWS` in sync with the `ActiveBuild` slot list.

### React Rule Violations (must fix before stricter lint enforcement)

| File | Line | Rule | Issue |
|------|------|------|-------|
| `src/components/AI/AIChatPanel.tsx` | 62 | `react-hooks/refs` | `saveSessionRef.current = saveSession` mutated during render — move into a `useEffect` |
| `src/hooks/useMarketplace.ts` | 74 | `react-hooks/refs` | Ref mutation during render |
| `src/pages/MarketplacePage.tsx` | 125 | `react-hooks/purity` | `Date.now()` called during render inside a filter — move to `useMemo` with appropriate deps |

### Cascading-Render Risk (`setState` synchronously inside `useEffect` body)

Affects: `Dashboard.tsx:109`, `NewsFallback.tsx:34`, `useBlogCMS.ts:146,251`, `useBlogComments.ts:43`, `useChats.ts:76`, `useCommunity.ts:137,141`, `CommunityPage.tsx:79`, `ProfilePage.tsx:87,106`. Functionally correct today but violates React's rules; the effect body should only set state asynchronously (inside a callback/subscription) or in a derived-state initialiser.

### Type Safety (`no-explicit-any`)

`AuthModal.tsx:70,124,155,168` · `useAIAssistant.ts:8,190,198` · `useAuth.ts:50,67,84,100` · `ProfilePage.tsx:127,384,400,423,438`. All are `catch (error: any)` blocks — replace with `catch (error: unknown)` + `instanceof Error` guard.

### Fast-Refresh Warnings (DX only, no prod impact)

`ChatContext.tsx:208`, `CountryContext.tsx:33`, `ThemeContext.tsx:34` export non-component values from context files; HMR treats them as non-fast-refreshable. Move the non-component exports to a separate `*Constants.ts` sibling to restore instant hot reload.

### Unused Variables

`CreateListingModal.tsx:171` — `_removed` · `CommunityPage.tsx:127-129` — `_linkedBlogId`, `_linkedBlogTitle`, `_images`.

### Missing Hook Dependency

`MarketplacePage.tsx:96` — `useEffect` missing `user` in dependency array (`react-hooks/exhaustive-deps`).

### Fix Priority

1. **Now**: `AIChatPanel.tsx:62` ref mutation + `MarketplacePage.tsx:125` impure render
2. **Next sprint**: Wrap all `catch` blocks with `unknown` + `instanceof Error` guard
3. **Backlog**: Move context non-component exports; fix `setState`-in-effect pattern; add `user` dep; remove unused vars; code-split the bundle
*