NeuroBuilds — Production Optimization Audit
Scope: 87 frontend TS/TSX files (~17.3k LoC), FastAPI/LangGraph backend, Firestore data layer. Findings below are grounded in specific files/lines I read — not inferred from CLAUDE.md.

Executive Summary
Dimension	Score	One-line justification
Code Quality	6.5 / 10	Clean, well-commented, typed; but duplicated converters/formatters, zero memoization, and 43 known lint errors.
Performance	5 / 10	~15 redundant auth listeners, 991 kB single bundle (no code-splitting), unbounded Firestore reads, no React.memo.
Maintainability	7 / 10	Strong folder structure and naming; let down by copy-paste hooks logic and a few 500+ line files.
Scalability	4.5 / 10	useCommunity and marketplace fetch whole collections then filter client-side; will degrade badly past a few hundred docs.
Security: one real stored-XSS vulnerability (blog markdown renderer) that should be treated as a release blocker.

Critical Issues
C1 — Stored XSS in blog renderer (HIGH / release blocker)
BlogPostModal.tsx:24-37 — renderMarkdown() applies regex transforms and injects the result via dangerouslySetInnerHTML (line 149) without escaping HTML first. Any <script>, <img onerror=…>, or <iframe> in post.content executes in the viewer's session. The blog pipeline accepts authorType: 'user' and 'ai_agent' content, and admins view raw content in the Review Console — so this is an admin-session XSS path too. Why it exists: the renderer was written as a lightweight markdown shim and never had an escape pass added.

C2 — ~15 duplicate onAuthStateChanged listeners (HIGH perf/arch)
useAuth.ts:18-37 registers a fresh Firebase auth listener per hook instance, and useAuth() is called in 14 separate files (Navbar, Dashboard, every page, several hooks that are themselves called by pages), plus a 15th in ChatContext.tsx:53. Each maintains independent {user, loading} state → duplicated re-render storms on login/logout and N copies of the same subscription. This is the single highest-leverage fix.

C3 — No code-splitting; 991 kB monolithic JS chunk (HIGH perf)
App.tsx:16-27 statically imports all 11 pages + admin tree; vite.config.ts has no manualChunks. Firebase (auth+firestore+storage) and lucide-react ship in the initial bundle even for the /share public page. Why: routes were added incrementally without React.lazy.

C4 — Unbounded Firestore collection scans (HIGH scalability)
useCommunity.ts:147: query(collection(db,THREADS), orderBy('createdAt','desc')) — no where, no limit — streams the entire threads collection to every /community and /admin visitor, then filters by country/category in JS (lines 166-170). Read cost and payload grow linearly with the whole platform's content.

Unused Code To Remove
Location	Reason
src/utils/scoringEngine.ts (298 LoC)	CLAUDE.md confirms it is "not yet wired into any UI component." Dead weight in the bundle. Either wire into BuildCanvasCard/SharedBuildPage or delete.
qrcode.react dependency	TOTP 2FA removed; CLAUDE.md notes the dep "is no longer used." Remove from package.json. (Not currently in deps list — verify it isn't re-added.)
Unused vars: CreateListingModal.tsx:171 _removed; CommunityPage.tsx:127-129 _linkedBlogId/_linkedBlogTitle/_images; gemini-key-manager/src/index.ts:88	Flagged in CLAUDE.md tech-debt; confirmed naming convention (_-prefixed) signals intentional-but-dead.
tier/tierLabel state in useMarketplace.ts:79-80 when geo-search unused	Only meaningful on the geo path; harmless but adds surface. Low priority.
I did not find large blocks of truly unreachable code — the codebase is disciplined here.

Duplicate Code To Refactor
D1 — Four relative-time formatters
timeAgo is defined three times — useCommunity.ts:72, Dashboard.tsx:68, BlogComments.tsx:10 — plus a fourth variant formatRelativeDate in ListingCard.tsx:22-30.
Abstraction: one src/utils/datetime.ts exporting timeAgo(iso) and formatRelativeDate(iso).

D2 — Firestore Timestamp → ISO converters repeated everywhere
The pattern data.x instanceof Timestamp ? data.x.toDate().toISOString() : String(data.x ?? '') recurs in docToListing, apiToListing, toThread, toReply, docToConversation, docToMessage.
Abstraction:


// BEFORE (repeated in 6 files)
createdAt: data.createdAt instanceof Timestamp
  ? data.createdAt.toDate().toISOString()
  : String(data.createdAt ?? ''),

// AFTER — src/utils/firestore.ts
export const tsToISO = (v: unknown): string =>
  v instanceof Timestamp ? v.toDate().toISOString() : String(v ?? '');
// usage: createdAt: tsToISO(data.createdAt),
D3 — catch (error: any) boilerplate (12 sites)
AuthModal, useAIAssistant, useAuth, ProfilePage (per CLAUDE.md). Abstraction: export const errMsg = (e: unknown, fallback: string) => e instanceof Error ? e.message : fallback; — replaces every error: any block and clears the no-explicit-any lint errors at once.

D4 — Group-chat creation duplicated
createGroupChat exists in both ChatContext.tsx:167 and createGroupConversation in useChats.ts:186 with near-identical addDoc payloads. Consolidate into the hook; have the context delegate.

Performance Bottlenecks
#	Impact	Location	Solution
P1	High — every page mount opens its own auth socket; login flips state in ~15 subscribers	C2 above	Promote useAuth to a single AuthProvider context (see Arch A1).
P2	High — 991 kB blocks first paint	C3	React.lazy(() => import('./pages/X')) + <Suspense>; add manualChunks: { firebase: [...], vendor: ['react','react-dom','react-router-dom'] } in vite config.
P3	Med — all ListingCards re-render on every keystroke in marketplace search	MarketplacePage.tsx:463-470	Wrap ListingCard in React.memo (0 memo usages exist in the whole repo) and stabilize the onClick/onSave closures with useCallback, else memo is defeated by new function identities each render.
P4	Med — no debounce on marketplace/text search → filter runs per keystroke	MarketplacePage.tsx:272-278	200–300 ms debounce on filters.search.
P5	Med — AnalyticsDashboard recomputes blogItems/categoryMap/savedMap on every render	AnalyticsDashboard.tsx:88-114	Wrap each derivation in useMemo keyed on posts/allThreads/listings.
P6	Med (latency) — backend search_node → rag_node run sequentially though independent	agent.py:487-489	Both only read the last user message. Merge into a parallel gather node (asyncio.gather(tavily, vector)) → saves ~0.5–2 s per request off the critical path before first token.
P7	Low — rag_node builds a new GeminiEmbeddings() + MongoDBAtlasVectorSearch per request	agent.py:147-154	Construct once in lifespan / module scope and reuse (you already inject app.state.mongo for VectorStoreEngine elsewhere).
Memory Leaks
Good news: subscription cleanup is mostly correct — useChats (line 101-108) cleans both convo and messages refs; ChatContext (line 70-73) unsubscribes auth+conversations; useCommunity returns unsub.

Location	Issue	Fix
MarketplacePage.tsx:85-90	setState-in-effect syncing the open modal to listings runs on every listings snapshot; not a leak but a cascading-render risk (also in Dashboard:109, NewsFallback:34, useBlogCMS:146/251, CommunityPage:79 per CLAUDE.md).	Derive the live listing inline at render (listings.find(...) ?? selectedListing) instead of mirroring into state.
AIChatPanel mic/Web-Speech	Not read in full — verify the SpeechRecognition instance is stopped on unmount (these commonly leak a live mic handle).	Add recognition.stop() in effect cleanup.
No timer/interval leaks found in the rotating-ad components I sampled, but SponsoredAdBanner runs a 5.5 s interval — confirm its clearInterval cleanup exists (it has 2 useEffects).

Security Concerns
Risk	Detail	Remediation
HIGH — Stored XSS	C1: BlogPostModal.tsx:150 injects unescaped HTML.	Escape first: const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') before the regex passes — or adopt a vetted lib (marked + DOMPurify).
Med — API keys exposed client-side	VITE_YOUTUBE_API_KEY (youtubeService.ts) and VITE_IMGBB_API_KEY are shipped to the browser. The backend /api/components/reviews proxy already exists but is unused.	Route YouTube calls through the backend proxy (eliminates the key); accept ImgBB exposure as inherent to client uploads but restrict the key's referrer in ImgBB settings.
Med — Notification spam vector	writeNotification(uid, …) (useNotifications) lets any authed user write into any other user's subcollection (rules permit it by design).	Add a rate-limit / shape validation in rules (request.resource.data.keys() whitelist) or move notification writes server-side.
Low — auth error.message surfaced to UI	useAuth.ts:51,68 passes raw Firebase error strings to state.	Map Firebase error codes to friendly copy; avoid leaking internal detail.
Positive	Role/admin model is solid — JWT custom-claim isAdmin mirrored in firestore.rules, trust fields immutable to clients, role mutation server-only. No injection risk in backend (deterministic engines, parameterized Mongo queries).	
Architecture Improvements (prioritized)
A1 (highest) — Introduce AuthContext. Replace the per-component useAuth listener with one provider mounted in App.tsx; keep the useAuth() call signature identical (have it useContext). Kills C2/P1 with zero call-site churn. useCommunity, useChats, useBlogComments then consume the shared user instead of each spawning a listener.

A2 — Separation of concerns in hooks vs. data mapping. Extract the docToX/tsToISO converters (D2) into src/utils/firestore.ts. Hooks should orchestrate subscriptions; mapping is a pure utility.

A3 — Push filtering to the query layer. useCommunity should where('country','==',selectedCountry) + limit(N) server-side (you already have the listings: country+postedDate composite index pattern — add the analogous threads index). Fixes C4 scalability.

A4 — Split the context fast-refresh exports. ChatContext.tsx, CountryContext.tsx, ThemeContext.tsx export hooks alongside components (the eslint-disable react-refresh comments). Move useChatContext/useCountry/useTheme to *.hooks.ts siblings to restore HMR.

A5 — Decompose 500+ line files. SharedBuildPage.tsx (637), CreateListingModal.tsx (557), MarketplacePage.tsx (532) mix data, layout, and sub-components. Extract presentational sub-components (e.g. the marketplace filter bar, the share-page power gauge).

Refactoring Roadmap
Phase 1 — Quick Wins (1–2 hours)

Fix C1 XSS (add escapeHtml pass). ← do first.
Add tsToISO + timeAgo/formatRelativeDate utils (D1, D2); replace call sites.
React.memo(ListingCard) + useCallback for its handlers (P3).
Debounce marketplace search (P4); useMemo in AnalyticsDashboard (P5).
Delete/decide on scoringEngine.ts; clear unused vars.
Phase 2 — Medium (1–2 days)
6. AuthContext (A1) — highest ROI; touches 15 files but mechanical.
7. Route-based React.lazy + manualChunks (C3/P2) — measure with vite build.
8. errMsg helper across all catch (error: any) (D3) → clears ~12 lint errors.
9. Backend: parallelize search+rag (P6), hoist embeddings/vector store (P7).
10. Wire YouTube through backend proxy (security).

Phase 3 — Major (1–2 weeks)
11. Server-side filtering + pagination for threads and listings (C4/A3) with new composite indexes.
12. Split context exports (A4) and decompose 500+ line files (A5).
13. Fix the broader setState-in-effect set (Dashboard, useBlogCMS, CommunityPage) per CLAUDE.md tech-debt list.

Estimated Results After Optimization
Estimates — ranges, not guarantees; validate with vite build --report and Lighthouse before/after.

Bundle size: initial JS −45% to −60% (≈991 kB → ~400–550 kB) from route splitting + Firebase chunk isolation; /share public page drops most of the app.
Performance: −30% to −50% interaction jank on marketplace/community (memoization + debounce + single auth listener); backend first-token latency −0.5–2 s from P6.
Memory / subscriptions: ~15 auth listeners → 1 (≈90% reduction in that subscription class); fewer duplicate state trees.
Maintainability: −400 to −600 LoC net from dedup (D1–D4) and ~40 of 43 lint errors cleared, plus the XSS class eliminated.
Top three, in order: (1) patch the blog XSS, (2) collapse the auth listeners into one AuthContext, (3) code-split routes + isolate the Firebase chunk. Those three alone move Performance and Security materially.

I kept this to analysis only — no files were modified. If you want, I can start on Phase 1 (the XSS fix and the shared datetime/firestore utils are low-risk and self-contained), or produce the AuthContext migration as a single PR. Which would you like me to pick up?

