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

### Gemini Key Manager (TypeScript / Node)
```bash
cd gemini-key-manager
npm install
npm run dev                             # Dry-run harness with mock keys
GEMINI_KEY_1=AIza... npm run dev        # Live run with real key(s)
```

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
```

The `/share` route uses a standalone layout — all chrome (Navbar, ChatSidebar, AuthModal, Footer) is suppressed via an `isSharePage` guard in `App.tsx`.

| Path | Component |
|------|-----------|
| `/` | `HomePage` — landing + live Firestore stats (active listings count, thread count) + featured blog post + community feed threads + `SponsoredAdBanner` + `HomeFeedAdSlot` |
| `/chat` | `ChatPage` → `AIChatPanel` — AI build assistant |
| `/blog` | `BlogPage` — Firestore-backed blog with admin CMS; uses `useUserRole` for role gating; supports deep-linking via `location.state` |
| `/marketplace` | `MarketplacePage` — Firestore listings |
| `/community` | `CommunityPage` — Firestore forums; supports deep-linking via `location.state.openThreadId` to auto-open a thread modal on mount |
| `/dashboard` | `Dashboard` — user's own listings, saved listings, and threads (Firestore real-time) |
| `/profile` | `ProfilePage` — display name, avatar URL, phone number, username (requires auth) |
| `/admin` | `AdminPage` — admin workspace: review queue, moderation desk, analytics, role management (requires `role: 'admin'`) |
| `/pricing` | `PricingPage` — renders `GradientBackground` + `Pricing` component |
| `/share` | `SharedBuildPage` — standalone read-only view of a shared AI build (no auth required) |
| `/dev/seed` | `DevSeedPage` — dev-only (`import.meta.env.DEV` guard); seeds Firestore with Pakistan-focused threads and marketplace listings |

### Data Layer

**Firestore (all live user data):**
- `listings` → `useMarketplace`
- `threads` + `threads/{id}/replies` → `useCommunity`
- `conversations` + `conversations/{id}/messages` → `useChats`
- `blogs` + `blogs/{id}/comments` → `useBlogCMS` / `useBlogFeed` / `useBlogComments` / `useReviewQueue`
- `reports` → `useReports`
- `advertisements` → `useAdvertisements` — Firestore-backed dynamic ad slots; documents carry `title`, `sponsorName`, `targetUrl`, `imageUrl`, `placement`, `status: 'active' | 'inactive'`, `accent: 'cyan' | 'purple'`
- `users/{uid}` → role (`role: 'user' | 'vendor' | 'moderator' | 'admin'`) + seller verification (`isVerified`, `phoneNumber`) + profile fields + `username`
- `users/{uid}/aiSessions` → `useAISessions` — AI chat session history (newest-first, limit 20)
- `users/{uid}/notifications` → `useNotifications` — in-app notifications (newest-first, limit 30)
- `usernames/{username}` → username → UID reverse-lookup index (atomic claim/release via `writeBatch`)

**localStorage** (seeded from `src/data/storage.json`) → `useStorage`:
Static/UI-only data: `NavLink`, `FooterLink`, `Feature`, `Testimonial`, `PricingTier`, `FAQItem`, `HowItWorksStep`, `appConfig`.

### Authentication

Firebase Auth only — email/password + Google OAuth. `useAuth` exposes `{ user, loading, error, register, login, googleSignIn, logout }`. `src/Firebase.ts` exports `auth`, `db`, `storage`, and `firebaseAuth`.

`firebaseAuth` is a typed wrapper object (not the raw `Auth` instance) exposing: `register`, `login`, `googleSignIn`, `logout`, `updateUserProfile`, `sendPasswordReset`, `getCurrentUser`, `onAuthStateChange`.

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
| `useReports` | Firestore `reports` | Platform moderation: `createReport`, `resolveReport`, `hideTarget` |
| `useNotifications` | Firestore `users/{uid}/notifications` | Real-time in-app notifications (limit 30, newest-first); `markRead`, `markAllRead`; exports `writeNotification()` helper for writing to another user's subcollection |
| `useAIAssistant` | FastAPI / mock | AI chat with streaming, build extraction, voice input |
| `useAISessions` | Firestore `users/{uid}/aiSessions` | Persist/load AI chat sessions; `saveSession(id, title, messages, activeBuild)`; real-time `onSnapshot`, ordered newest-first, limit 20 |
| `useSellerVerification` | Firestore `users` + FastAPI `/api/verify` | Phone OTP flow via WhatsApp gateway; `sendVerificationCode` POSTs to `/api/verify/request`, `verifyOTP` POSTs to `/api/verify/confirm` |

### Notifications System (`src/components/Notifications/`)

- **`NotificationBell.tsx`** — bell icon in Navbar showing unread count badge; click opens drawer; click-outside detection to dismiss
- **`NotificationDrawer.tsx`** — dropdown listing last 30 notifications; mark-read on click; types: `blog_comment`, `thread_reply`, `marketplace_message`, `ai_build_ready`; navigation links per type
- **`writeNotification(uid, data)`** — exported from `useNotifications`; any hook/service calls this to push a notification into another user's subcollection

### Ads System (`src/components/Ads/`)

Three ad components, all following the cyberpunk design system. Two are backed by static data; one by Firestore.

- **`SponsoredAdBanner.tsx`** — full-width rotating banner; crossfades every 5.5 s; progress bar at bottom tracks position; gradient icon fallback when `imageUrl` is empty; `accent` prop controls cyan/purple theming; defaults to `BANNER_ADS` from `sponsoredAds.ts`
- **`SponsoredNodeMicro.tsx`** — one-line inline ticker ("SPON" tag + sponsor // tagline) that slides in from left every 4.2 s; used inside listing/thread cards; defaults to `MICRO_ADS`
- **`HomeFeedAdSlot.tsx`** — same ticker format but Firestore-backed via `useAdvertisements('homepage_feed')`; shows a skeleton while loading; renders nothing if no active ads for that placement

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
1. `useAIAssistant.sendMessage` POSTs to `${VITE_AI_SERVICE_URL}/api/chat` with message history + `activeBuild` context
2. Response is consumed as a raw byte stream via `liveStream()` (no SSE framing)
3. Any ` ```json { "build": {...} }``` ` block in the response is parsed by `extractBuild()` and merged into `activeBuild` state
4. If the service is unreachable (10 s timeout / non-ok response), falls back to `MOCK_RESPONSE` streamed locally at ~22ms/token
5. `ChatPage` passes `location.state.initialMessage` for deep-linking into a pre-populated chat
6. When streaming ends, `AIChatPanel` auto-saves the session via `useAISessions.saveSession()` with a generated title
7. "Generate PC Part Picker List" button calls `formatPartsList()` — formats `activeBuild` as a readable list (functional)
8. "Share Build" opens `/share?build=<encoded>` in a new tab via `openSharePage()` — encodes `activeBuild` as `btoa(encodeURIComponent(JSON.stringify(build)))`

`sendMessage` uses refs (`messagesRef`, `activeBuildRef`, `isStreamingRef`) to access latest state without adding them as `useCallback` dependencies — keeping the function identity stable.

**`BuildCanvasCard`** tracks: CPU, GPU, Motherboard, RAM, PSU. Calculates power budget as `cpuTdp + gpuTdp + 150W buffer` vs `psu.rating`. Shows live estimated total cost.

### Shared Build Page (`src/pages/SharedBuildPage.tsx`)

Standalone read-only page at `/share?build=<base64>`. The `build` query param is `btoa(encodeURIComponent(JSON.stringify(activeBuild)))`.

Features:
- **Component cards** — one card per populated slot (CPU, GPU, Motherboard, RAM, PSU); click opens a detail modal
- **Component detail modal** — full spec sheet, power badge (TDP/rating), YouTube review search link (Gamers Nexus / Hardware Unboxed / LTT), PCPartPicker search link
- **Power speedometer** — SVG semicircular gauge showing PSU load % with colour zones (green < 80%, amber 80–100%, red > 100%)
- **Total cost panel** — sum of all component prices
- **Copy build list** — formats build to plain text and copies to clipboard
- **"Build with Neuro AI"** — links back to `/chat`
- No Navbar/Footer/auth required; shows an error state for invalid/missing `?build=` params

### Admin System (`src/pages/AdminPage.tsx` + `src/components/Admin/`)

Admin-only workspace at `/admin`. Requires auth + `role: 'admin'` in `users/{uid}` (checked via `useAdminRole()`). Six tabbed sections (tab order: Review Queue → Platform Moderation → Analytics → Role Management → Blog Automator → Telemetry):

**ReviewConsole.tsx** — Blog post moderation queue
- Uses `useReviewQueue` — server-side filtered snapshot; posts vanish from the queue the moment they are approved or rejected in Firestore
- Inline title/content editing before approval
- Approve → `approvePost(id, publishAt?)` — immediate publish or scheduled
- Reject → `rejectPost(id, note)` — reverts to draft with `rejectionNote` shown to author

**ModerationDesk.tsx** — User-reported content
- Real-time list of `reports` collection, filterable by Open / Resolved / All
- Actions: `hideTarget(targetId, targetType)` sets `status: 'hidden'` on the target listing/thread; `resolveReport(id)` closes the report
- Report columns: Reporter, Reason, Target, Type, Date, Actions

**AnalyticsDashboard.tsx** — Platform trends (horizontal bar charts)
- Most Commented blogs — from `useBlogFeed(true)` sorted by `commentCount`
- Top Categories by upvotes — from `useCommunity()` grouped by `category`
- Most Saved listings — from `useMarketplace()` sorted by `savedBy.length`

**RoleAssignmentMatrix.tsx** — User role management
- Search users by display name; reassign role (`user` → `vendor` → `moderator` → `admin`)
- Real-time Firestore updates to `users/{uid}.role`

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
status: 'active' | 'sold' | 'reserved' | 'hidden'   ← 'hidden' set by moderation
tags: string[], specs: Record<string, string>
views, savedBy: string[]
sku?: string, stockQty?: number   ← vendor inventory fields
postedDate: Timestamp
```

**Components:**
- **`CreateListingModal.tsx`** — full listing create/edit form; title, description, price, condition, listing type, location (country/city/area via `GLOBAL_LOCATIONS`), category, up to 6 ImgBB-uploaded images, SKU/stock quantity for vendors
- **`ListingCard.tsx`** — grid preview card with thumbnail, price, condition badge, save toggle
- **`ListingDetailModal.tsx`** — full detail view; image gallery, seller info with contact reveal, view tracking (excludes self-views), `VideoReviewCarousel`, save/contact/edit/delete actions
- **`VideoReviewCarousel.tsx`** — YouTube review carousel; lazy-loads iframe on thumbnail click; backed by `youtubeService.ts`
- **`SellerVerificationModal.tsx`** — two-step phone OTP verification modal for seller activation
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

Redirects unauthenticated users to `/`.

### Moderation System

**Firestore schema** (`reports` collection):
```
reporterId, reporterName
reason: string
targetId, targetTitle
targetType: 'listing' | 'thread'
status: 'open' | 'resolved'
createdAt
```

`useReports()`:
- Real-time `onSnapshot` ordered by `createdAt` desc
- `createReport(data)` — any authenticated user submits a report
- `resolveReport(reportId)` — admin marks resolved
- `hideTarget(targetId, targetType)` — sets `status: 'hidden'` on the target document in `listings` or `threads`

### Services (`src/services/`)

**youtubeService.ts** — YouTube review discovery
- `fetchComponentReviews(componentName)` — searches YouTube Data API v3 for Gamers Nexus / Hardware Unboxed / LTT reviews
- Returns up to 3 `VideoItem` objects: `{ videoId, title, channelTitle, thumbnail }`
- 24-hour `sessionStorage` cache per component name
- Falls back to empty array if `VITE_YOUTUBE_API_KEY` is absent or request fails

### Utilities (`src/utils/`)

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

### Design System

Cyberpunk/neon glassmorphism. Defined in `tailwind.config.js` + `src/index.css`:
- **Colors**: `primary` (`#0df2f2` cyan), `accent-purple` (`#bf00ff`), `bg-dark` (`#1e1e1e`), `bg-panel` (`#252526`)
- **Key utilities**: `.glass-panel`, `.rounded-bento` (2rem radius), `.shadow-neon`, `.shadow-glow-purple`, `.scanline`
- **Font**: Space Grotesk
- **Z-index**: Navbar `z-50`, modals `z-50`, ChatSidebar backdrop `z-[60]`, ChatSidebar panel `z-[70]`

New UI should follow: backdrop blur, neon shadows on hover, dark panel backgrounds, `font-mono` for terminal/data text.

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
- `role`, `isVerified`, and `phoneNumber` fields in `users/{uid}` are immutable to non-admins (`isNotChangingTrustFields()` helper). `isVerified`/`phoneNumber` are written **only** server-side by `routers/verify.py` via the Admin SDK (which bypasses rules) — a client cannot self-grant the verified badge
- `listings` create requires `isVerifiedSeller()` (a `get()` on the caller's `users/{uid}.isVerified == true`) — the seller-verification gate is enforced server-side, not just by the React modal overlay
- `isModerator()` falls back to a Firestore doc read on `users/{uid}.role in ['moderator', 'admin']`
- Authenticated users can read/write their own subcollections (`aiSessions`, `notifications`); any signed-in user may push a notification into another user's subcollection
- `threads` update rules are fine-grained: authors can edit content or mark `lifecycleStatus: 'solved'`; moderators can change `lifecycleStatus` only; anyone can make vote-only updates (`upvoteCount`, `upvotedBy`, etc.)
- `reports` writable by any authenticated user; `read, update, delete` restricted to admins only (moderators cannot read reports)
- `audit_logs` — append-only trail (§2.2.4): any signed-in user may create an entry attributed to themselves (`actorId == uid`, server `createdAt`); only admins may read; update/delete forever denied. Written by `src/utils/auditLog.ts` (`writeAuditLog`) on listing create + moderation actions (`hideTarget`, `resolveReport`)
- `blogs` read: published posts are public; admins see all; authors see their own regardless of status

**`firestore.indexes.json`** — composite indexes:
- `blogs`: `isPublished` ASC + `createdAt` DESC
- `blogs`: `status` ASC + `publishAt` ASC (supports scheduled-post queries)
- `blogs`: `authorType` ASC + `createdAt` DESC (AI-agent post feed in `useBlogCMS`)
- `listings`: `country` ASC + `postedDate` DESC
- `listings`: `status` ASC + `postedDate` DESC (HomePage active-listings feed)
- `conversations`: `participants` (array) + `updatedAt` DESC; `participants` (array) + `listingId` ASC

### FastAPI Backend (`backend/`)

The backend is a standalone Python service — **must be run separately** from the Vite dev server.

**Endpoints:**
- `GET /health` — returns `{"status": "ok", "service": "neurobuilds-ai"}`
- `GET /api/hardware/lookup` — searches `hardware_catalog` collection; requires `require_admin`
- `POST /api/chat` — accepts `{messages, activeBuild}`, returns a raw token stream (`text/plain`)
- `GET /api/marketplace/search` — public 3-tier cascading geo-fallback search (query params: `area`, `city?`, `limit?`)
- `POST /api/marketplace/search` — same search with richer filter body; requires `require_admin`
- `GET /api/admin/gemini/status` — sanitised Gemini key-pool snapshot (keys redacted); requires `require_admin`
- `POST /api/admin/blog-automator/trigger` — queues AI blog generation pipeline; requires `require_admin`
- `GET /api/admin/blog-automator/jobs` — lists recent automator jobs newest-first; requires `require_admin`
- `POST /api/admin/users/{uid}/role` — assigns a role; sets BOTH `users/{uid}.role` AND the JWT `admin` custom claim (and revokes the target's refresh tokens) so the Firestore role and the rules' `isAdmin()` claim stay in sync; requires `require_admin` (`routers/admin_users.py`)
- `GET /api/components/reviews` — YouTube review proxy with server-side MongoDB TTL cache (24 hours — matches SRS §2.2.1 / UC-04); query param: `component` (e.g. `RTX 4070`); returns up to 3 `VideoItem` objects; falls back to empty array if `YOUTUBE_API_KEY` absent or on quota/403, in which case the frontend `VideoReviewCarousel` renders a "Search on YouTube" deep link; cache stored in `youtube_cache` collection with TTL index on `cachedAt` (migrated via `collMod` if a stale TTL exists); no auth required (`routers/components.py`)

**Firebase Admin SDK** is initialised in the FastAPI lifespan handler. Set `FIREBASE_SERVICE_ACCOUNT_PATH` to a service-account JSON file. On GCP the env var may be omitted — Application Default Credentials are used as a fallback. Required by all `require_admin`-guarded endpoints; non-fatal at startup (admin endpoints return 503 until resolved).

**LangGraph pipeline** (`agent.py`) — 6 nodes executed sequentially:

```
START → search_node → rag_node → intent_node → selection_node
      → compatibility_node → response_node → END
```

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
| `search_node` | — | async | Tavily web search for live hardware prices (3 results) | Empty string |
| `rag_node` | — | async | MongoDB Atlas vector similarity search on `hardware_specs` | Empty string |
| `intent_node` | A | LLM (temp=0) | Extracts `BuildIntent`: budget, use_case, perf_target, brands, form factor | Safe defaults |
| `selection_node` | B | pure Python | Price breakdown, budget constraint check, allocation ratios, efficiency score | "No priced components" |
| `compatibility_node` | C | pure Python | PSU transient margin, socket match, BIOS flash advisory, RAM type, bottleneck %, upgrade path | "No active build" |
| `response_node` | D | LLM (streaming) | Narrates Layer B+C findings into prose; forbidden from recalculating any figure | Pipeline error token |

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

**`BuildState`** TypedDict: `messages`, `active_build`, `search_context`, `rag_context`, `build_intent`, `selection_report`, `compatibility_report`.

**Streaming**: `run_pipeline()` uses `astream_events(version="v2")` and yields only `on_chat_model_stream` events from the `response` node. `main.py` wraps this in `StreamingResponse` with `media_type="text/plain"` and `X-Accel-Buffering: no`. The frontend consumes raw bytes directly — no SSE framing.

**System prompt** in `response_node` explicitly forbids the LLM from recalculating compatibility, performing price arithmetic, or contradicting any figure produced by `selection_node` or `compatibility_node`. It positions the LLM as a "translator, not a calculator."

**Backend environment variables** (in `backend/.env`):

| Var | Purpose |
|-----|---------|
| `GEMINI_KEY_1` … `GEMINI_KEY_10` | Pool-mode key rotation via `GeminiKeyManager`; set at least `GEMINI_KEY_1` for pool mode |
| `GOOGLE_API_KEY` | Single-key fallback when no `GEMINI_KEY_N` vars are set; also used for embeddings |
| `GEMINI_MODEL` | Defaults to `gemini-2.0-flash`; used in `intent_node`, `response_node`, and blog automator |
| `TAVILY_API_KEY` | Node 1 web search + blog automator research stage |
| `MONGODB_ATLAS_URI` | Node 2 vector store connection |
| `MONGODB_DATABASE` | Defaults to `neurobuilds` |
| `MONGODB_COLLECTION` | Defaults to `hardware_specs` |
| `MONGODB_VECTOR_INDEX` | Defaults to `vector_index` |
| `MONGODB_CATALOG_COLLECTION` | Defaults to `hardware_catalog` — used by `ingest_hardware.py` and `/api/hardware/lookup` |
| `MONGODB_LISTINGS_COLLECTION` | Defaults to `listings` — used by `GET /api/marketplace/search` |
| `CORS_ORIGINS` | Comma-separated allowed origins; defaults to `http://localhost:5173,http://127.0.0.1:5173` |
| `MONGODB_CACHE_COLLECTION` | Defaults to `semantic_cache` — used by `cache_manager.py`; requires a `semantic_cache_index` vector search index (768 dims, cosine) created manually in Atlas UI |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Path to Firebase service-account JSON; required by `require_admin` / `require_auth` dependencies; on GCP can be omitted (Application Default Credentials used) |
| `FIREBASE_PROJECT_ID` | Firebase project ID; only needed when `FIREBASE_SERVICE_ACCOUNT_PATH` is absent and ADC doesn't supply it |
| `WHATSAPP_GATEWAY_URL` | URL of the WhatsApp OTP gateway microservice; defaults to `http://127.0.0.1:3001` |
| `GATEWAY_SECRET` | Shared Bearer secret for the WhatsApp gateway `/send-otp` endpoint; must match `GATEWAY_SECRET` set in the gateway process |
| `YOUTUBE_API_KEY` | YouTube Data API v3 key used by the **backend** `GET /api/components/reviews` proxy; distinct from `VITE_YOUTUBE_API_KEY` (frontend direct-call fallback) |

MongoDB Atlas requires a Vector Search index named `vector_index` on the `embedding` field (768 dims, cosine — Gemini `text-embedding-004`). `GPU_Exhaustive_Database.csv` and `CPU_Exhaustive_Database.csv` (repo root) contain hardware data for reference.

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
- Source: `backend/data/hardware_source.json` (default) or a structured CSV via `--source`; CPU/GPU rows only. Sample `hardware_source.json` + `hardware_source.csv` ship in `backend/data/`
- Serialises each component into a LangChain `Document` (`langchain_core.documents`): pipe-delimited `page_content` spec string + flattened spec `metadata` (CPU: `socket/cores/threads/tdp_watts/integrated_graphics`; GPU: `vram_gb/interface/tdp_watts/power_connectors`)
- **Idempotency**: Mongo `_id` = SHA-256(`brand|model`); a `content_hash` skips unchanged docs (zero re-embedding) and upserts only new/changed ones
- **Async batch embedding**: `--batch-size` (default 64, 50–100 recommended) chunks, `--concurrency` (default 4) in flight via `GeminiEmbeddings` (768-dim); per-row + per-chunk try/except with structured logging — corrupt rows are skipped, not fatal
- Writes `content` + `embedding` so docs are immediately queryable; the Atlas `vector_index` (768 dims, cosine) must already exist

**`misc/csv-data/scrapper.py`** — TechPowerUP GPU database scraper:
- Two-phase scraping: chip discovery (horizontal) → custom board traversal (vertical)
- Extracts clocks, VRAM, AIB partner info; anti-bot throttling (5–10s delays)
- Output: `GPU_Exhaustive_Database.csv` at repo root

### Backend Service Modules (`backend/services/`)

**`validation_engine.py`** — 9-tier deterministic compatibility matrix (Layer C):
- `run_checks(build, case?) → ValidationResult` — returns `{ ok, issues, warnings, passed }`
- Check tiers: PSU transient margin (GPU-family-specific spike multipliers), CPU↔MB socket, BIOS flash advisory (AM4-400 + Ryzen 5000), RAM DDR4/DDR5 type, form factor fit, GPU physical clearance, CPU cooler clearance, hardware bottleneck (tier-gap %), platform upgrade path
- GPU transient multipliers: RTX 40-series ×1.25, RTX 30 ×1.15, RX 7 ×1.20, RX 6 ×1.10; safety factor 1.20×
- Pure Python, zero LLM/API calls; shared by `agent.py` nodes, ingestion scripts, and `tests/evaluation_suite.py`

**`selection_engine.py`** — deterministic budget allocation model (Layer B):
- `run_allocation(budget, use_case, build, collection, attempt, excluded) → AllocationResult`
- `ALLOCATION_WEIGHTS` — per-persona budget fractions: `gaming` (GPU 40%, CPU 20%, MB 12%, RAM 8%, PSU 8%), `workstation` (CPU 35%, GPU 30%, MB 15%, RAM 12%, PSU 8%), etc.
- Ceiling = `budget × weight × 1.15` margin; per-retry ceiling reduction on CPU/GPU when compatibility fails; excluded-names blacklist to skip incompatible components on retry
- MongoDB `performance_score`-ranked queries with price-sort fallback; builds human-readable report string for Layer D narration
- Zero LLM calls; thin `budget_allocation_node` in `agent.py` wraps this

**`location_search.py`** — 3-tier cascading geo-fallback search:
- `LocationSearchService(collection).search(area, extra_filters?, radius_m?, limit?) → GeoSearchResult`
- `GeoSearchResult` carries `listings`, `tier` (1–3), `tier_label` (e.g. "Tariq Garden" / "Nearby Tariq Garden" / "All of Lahore"), `count`
- Tier 1: exact `area` field match; Tier 2: `$nearSphere` within 8 km of area centroid (requires `2dsphere` index on `geo` field); Tier 3: city-wide fallback
- Embeds `_AREA_CENTROIDS` dict (7 cities — Islamabad, Lahore, Karachi, Peshawar, Quetta, Gilgit, Muzaffarabad) that mirrors `src/data/pakistanGeoLocations.ts`
- `ensure_indexes(col)` — creates `2dsphere` + compound indexes; safe to call on every startup

**`cache_manager.py`** — MongoDB Atlas LLM semantic cache:
- `setup_semantic_cache(client, db_name)` — binds `MongoDBAtlasSemanticCache` globally so all LangChain LLM calls (`intent_node`, `response_node`) are auto-intercepted
- Cosine similarity threshold: 0.97 (tight — avoids false cache hits on different budgets)
- Collection: `semantic_cache`; index: `semantic_cache_index`; requires `langchain-mongodb`
- Silently no-ops if `OPENAI_API_KEY` absent, `langchain-mongodb` not installed, or Atlas unreachable — never blocks startup
- Called once in FastAPI lifespan handler in `main.py`

**`auth_guard.py`** — FastAPI dependencies for Firebase JWT verification:
- `require_admin` — verifies Bearer token via Firebase Admin SDK + asserts `admin: true` custom claim; raises HTTP 401/403/503
- `require_auth` — same verification but accepts any valid non-revoked Firebase ID token (no admin claim check); raises HTTP 401/503
- Both dependencies are used with `Annotated[str, Depends(...)]` and return the verified UID

**`gemini_manager.py`** — Python port of `gemini-key-manager/` (TypeScript):
- `GeminiKeyManager` — asyncio-safe pool manager; loads `GEMINI_KEY_1..GEMINI_KEY_10` from env, falls back to `GOOGLE_API_KEY`; 60-req/min rolling window per key; Fisher-Yates load balancing; `mark_throttled(key, cooldown_s)` + `evict_expired_throttles()`
- `GeminiClient` — async wrapper with transparent 429-rotation retry; `generate_text(prompt, *, model, system_prompt, max_tokens, temperature)` and `embed_content(text)` both run `google-genai` SDK calls via `asyncio.to_thread()`
- Module-level singletons: `gemini_manager: GeminiKeyManager | None` and `gemini_client: GeminiClient | None` (None when no API keys are set)
- Used by `blog_automator.py` and exposed via `GET /api/admin/gemini/status`

**`embeddings.py`** — `GeminiEmbeddings` — LangChain `Embeddings` subclass backed directly by the `google-genai` SDK:
- Lazy model resolution: tries `embedding-001` → `text-embedding-004` → `gemini-embedding-exp-03-07` on first call, caches the winner
- Used by `VectorStoreEngine` (replacing the previous inline embedding setup)

**`vector_store.py`** — `VectorStoreEngine` — wraps `MongoDBAtlasVectorSearch` with a shared injected `MongoClient` (zero extra connection pools):
- Uses `GeminiEmbeddings` from `services.embeddings`
- `ingest_documents(docs)` — embed + insert; `get_retriever(top_k)` — LangChain retriever; `similarity_search(query, top_k)` — direct search
- Accepts the `MongoClient` from `app.state.mongo` at construction; instantiated once in the FastAPI lifespan handler

### Blog Automator Router (`backend/routers/blog_automator.py`)

Python migration of the TypeScript `blog-automator/` service into the FastAPI backend. All LLM calls use `gemini_client` from `services.gemini_manager`. All endpoints require `require_admin`.

**Pipeline stages:**
```
[1] Research  — Tavily web search (top 5 results, same TAVILY_API_KEY as agent.py)
[2] Draft     — Gemini writer LLM (system prompt: SEO-optimised long-form, 1500–2500 words)
[3] Critique  — Gemini critic LLM (JSON response: score 0–100, feedback[], requiresRevision)
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

- **Experiment 1 — Compatibility Engine Accuracy**: runs `run_checks()` against a fixture of labelled builds (Known Good / Intentionally Broken); reports confusion matrix, Precision, Recall, F1
- **Experiment 2 — Budget Allocation Adherence**: runs `run_allocation()` across gaming/workstation/budget persona builds; reports MAE, variance, per-persona breakdown versus `ALLOCATION_WEIGHTS` targets
- Imports directly from `services.validation_engine` and `services.selection_engine`

### Gemini Key Manager (`gemini-key-manager/`)

Standalone TypeScript service — resilient Gemini API key rotation and load-balancing. The Python equivalent (`backend/services/gemini_manager.py`) is the live backend implementation; this TypeScript service is the reference implementation / standalone utility.

**Architecture:**
- **`KeyRotationManager`** (singleton) — manages a pool of up to 10 Gemini API keys; tracks per-key `requestsInCurrentWindow` and `tokensInCurrentWindow` (60-second rolling windows, 60 req/window cap); picks the least-utilised key from the lower half of the pool (Fisher-Yates shuffle to prevent hot-spotting)
- **`GeminiProxyService`** — wraps `@google/genai` SDK; `generateText(prompt, model?)` and `getEmbeddings(text)` auto-retry with next available key on 429; parses `Retry-After` header for cooldown duration; retries bounded by pool size
- `markThrottled(key, cooldownMs)` / `evictExpiredThrottles()` — auto-recovery when cooldown expires
- `getStats()` — sanitized snapshot (keys redacted) for logging

**Test harness (`src/index.ts`):** 5-phase demonstration — sequential warm-up (4 requests), concurrent burst (12 parallel text), embedding burst (8 parallel embed), throttle recovery check, final pool stats table.

**Environment:** `GEMINI_KEY_1` … `GEMINI_KEY_10` — falls back to mock keys for dry-run/CI if none set.

## Frontend Environment Variables

| Var | Required | Purpose |
|-----|----------|---------|
| `VITE_FIREBASE_API_KEY` etc. | Yes | Firebase config (6 vars) |
| `VITE_AI_SERVICE_URL` | No (defaults to `http://localhost:8000`) | FastAPI AI service base URL |
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
- **Notification triggers**: `writeNotification()` is exported but not yet called from marketplace/community/blog hooks — notifications are not yet generated on user actions.
- **LLM semantic cache**: `cache_manager.setup_semantic_cache()` is wired into `main.py` startup but requires a `semantic_cache_index` Atlas Vector Search index to be created manually before the first cached call.
- **Blog Automator UI**: `src/components/Admin/BlogAutomatorPanel.tsx` is wired into `AdminPage.tsx` as tab 5. Backend pipeline at `backend/routers/blog_automator.py` is live.
- **Location search API exposure**: `GET /api/marketplace/search?area=&city=&limit=` is live in `main.py`. The frontend still uses Firestore client-side filtering; wire it to this endpoint when ready.
- **`pakistanGeoLocations.ts` ↔ backend sync**: area centroids in `src/data/pakistanGeoLocations.ts` and `backend/services/location_search.py`'s `_AREA_CENTROIDS` are manually kept in sync — no automated check.
- **YouTube proxy vs client-side**: `GET /api/components/reviews` is a server-side YouTube proxy (7-day MongoDB TTL cache). The frontend `src/services/youtubeService.ts` still calls the YouTube API directly via `VITE_YOUTUBE_API_KEY`. Wire `ListingDetailModal` / `SharedBuildPage` to the backend proxy when ready to avoid exposing the API key client-side.
- **JS bundle size**: Production build outputs a single 991 kB JS chunk (> 500 kB Vite threshold). Needs route-based code splitting (`React.lazy` + `Suspense`) or `rollupOptions.output.manualChunks` to pass Lighthouse performance budget.

## Known Lint Errors & Technical Debt

**Build status**: TypeScript compiles clean (`tsc -b` passes). ESLint reports **43 errors, 4 warnings** as of last audit.

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

`gemini-key-manager/src/index.ts:88` — `status` · `gemini-key-manager/src/services/KeyRotationManager.ts:136` — `_redacted` · `CreateListingModal.tsx:171` — `_removed` · `CommunityPage.tsx:127-129` — `_linkedBlogId`, `_linkedBlogTitle`, `_images`.

### Missing Hook Dependency

`MarketplacePage.tsx:96` — `useEffect` missing `user` in dependency array (`react-hooks/exhaustive-deps`).

### Fix Priority

1. **Now**: `AIChatPanel.tsx:62` ref mutation + `MarketplacePage.tsx:125` impure render
2. **Next sprint**: Wrap all `catch` blocks with `unknown` + `instanceof Error` guard
3. **Backlog**: Move context non-component exports; fix `setState`-in-effect pattern; add `user` dep; remove unused vars; code-split the bundle
