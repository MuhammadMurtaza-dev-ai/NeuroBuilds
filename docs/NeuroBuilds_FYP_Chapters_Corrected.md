---
title: "NeuroBuilds — Corrected Front Matter & Chapters 1–4 (Aligned to Codebase)"
subtitle: "Project ID: Fall-2025-13 · BSCS Fall 2022–2026 · The University of Lahore"
author:
  - Muhammad Murtaza (70137270)
  - Atika Khalid (70135799)
  - Ahmad Zia (70138374)
advisor: "Sir Naveed Ahmad Khan"
toc: true
toc-depth: 3
numbersections: false
geometry: margin=1in
fontsize: 11pt
---

<!--
=====================================================================
 CORRECTIONS APPLIED (vs. the original Phase 1 prose)
 ---------------------------------------------------------------------
 Every factual claim below now matches the actual codebase and the
 already-corrected Phase 2 diagram supplement (NeuroBuilds_FYP_Phase2.md):

  • Architecture is NOT MERN. There is NO Node.js/Express API Gateway.
    The React PWA calls (a) a single Python/FastAPI AI microservice and
    (b) Firebase Firestore directly via SDK. Node.js is used ONLY for the
    standalone WhatsApp OTP gateway and the Gemini key-manager utility.
  • OTP delivery = WhatsApp gateway (whatsapp-web.js), not SMS.
  • LLM provider = Google Gemini (gemini-2.0-flash + text-embedding-004,
    768 dims), not OpenAI.
  • Images = ImgBB, not Firebase Storage. (Firebase Storage SDK is
    available but the live upload path is ImgBB.)
  • UI = Tailwind CSS (custom design system). Material UI is NOT used.
  • Data split: Firestore holds ALL live user/social/marketplace/blog
    data (realtime). MongoDB Atlas holds the hardware knowledge base
    (vector specs for RAG), the hardware catalogue, the LLM semantic
    cache, and a listings mirror used only by the geo-search API.
  • YouTube review cache TTL = 24 hours (sessionStorage), not 7 days.
  • API payloads = JSON over REST + a raw text/plain token stream for
    /api/chat. (The "TOON" claim was incorrect.)
  • Backend = standalone FastAPI/uvicorn service. The 10-second limit is
    a FRONTEND fetch timeout that triggers a local mock fallback — it is
    not a Vercel serverless function limit.
  • Roles = user | vendor | moderator | admin (four-tier RBAC).
  • Compatibility engine = 9-tier deterministic validation_engine.py that
    DOES run advisory physical-fit checks (form factor, GPU clearance,
    cooler clearance) but does not GUARANTEE physical compatibility.
  • The AI pipeline is a 6-node LangGraph graph with an explicit
    deterministic / probabilistic layer split (Layers A–D).
=====================================================================
-->

\newpage

# Project Summary (Corrected)

**Introduction:** The customization of personal computers (PCs) offers a superior performance-to-cost ratio but demands technical expertise that most consumers lack. The purpose of NeuroBuilds is to democratize hardware knowledge and provide a transparent, data-driven alternative to reliance on potentially biased local shopkeepers.

**Problem Statement:** Novice buyers in local markets (e.g., Lahore) face a dual challenge: the intricate technical complexity of hardware compatibility (both electronic and physical) and the "adversarial" nature of unregulated marketplaces, where sellers often push outdated inventory to maximise profit. Reliance on generic generative-AI tools is equally risky, because such tools "hallucinate" specific numeric and compatibility constraints.

**Procedures:** To address these issues we built a web-based Decision Support System (DSS) as a **decoupled, polyglot application**: a React + TypeScript Progressive Web App on the client, a single **Python/FastAPI AI microservice** for reasoning, **Firebase (Authentication + Firestore)** for realtime user and social data, and **MongoDB Atlas** as the vector knowledge base. The intelligence layer uses a **Hybrid Retrieval-Augmented Generation (RAG)** architecture orchestrated with **LangChain/LangGraph**, combining a verified vector database of component specifications with real-time web search (Tavily API) to cover new product releases. Critically, all budget arithmetic and compatibility logic run in **deterministic Python engines**, not in the LLM. We integrated the **YouTube Data API v3** to surface context-aware video reviews and a **WhatsApp-based OTP verification** flow to filter fraudulent sellers in a peer-to-peer marketplace.

**Results:** The system generates electronically compatible PC build lists from natural-language input (text or voice). A deterministic engine validates each build (socket, PSU transient margin, RAM generation, form-factor and clearance advisories), the system aggregates trusted third-party video reviews for visual validation, and a verified local marketplace connects users for trading — together reducing the "research fatigue" of PC building.

**Conclusions:** By separating probabilistic AI narration from deterministic verification, and by combining real-time data retrieval with community validation, NeuroBuilds bridges the "Physical-Digital Gap." It does not claim to be a foolproof automated builder; it is a high-assistance ecosystem that mitigates incompatibility and marketplace fraud for the Pakistani consumer.

\newpage

# Abstract (Corrected)

## Area of the Project

Artificial Intelligence, Large Language Models (LLMs), Natural Language Processing, Retrieval-Augmented Generation, Expert / Decision-Support Systems, Web Application Engineering, E-Commerce, Information Retrieval.

## Technologies Used

- **Frontend:** React.js (TypeScript), Vite, Tailwind CSS (custom "cyberpunk" design system), Web Speech API (voice input), `vite-plugin-pwa` (installable PWA). Figma / Draw.io for UI and UML design.
- **AI Microservice (Backend):** Python, **FastAPI** (run with `uvicorn`), **LangChain + LangGraph** (6-node agent pipeline), with two deterministic pure-Python engines (`validation_engine.py`, `selection_engine.py`).
- **Large Language Model:** **Google Gemini** (`gemini-2.0-flash` for intent + narration; `text-embedding-004`, 768-dim, for embeddings), accessed through a resilient API key-pool rotation manager.
- **Database & Storage:** **Firebase Authentication** (email/password + Google OAuth + TOTP 2FA), **Firebase Firestore** (realtime document store for all user, marketplace, community and blog data), **MongoDB Atlas** (vector search over the hardware knowledge base, hardware catalogue, and LLM semantic cache), **ImgBB** (image hosting).
- **External APIs:** **Tavily Search API** (real-time web search), **YouTube Data API v3** (review aggregation), **GNews API** (regional tech-news fallback), **WhatsApp OTP gateway** (`whatsapp-web.js`, identity verification).
- **Development Tools:** Visual Studio Code, Git / GitHub, Draw.io (UML modelling), PlantUML (diagram sources).

> **Note on the stack label.** This project is **not** a classic MERN application. Express.js is not used as an application backend; there is no Node/Express API gateway. The only Node.js processes are the standalone WhatsApp OTP gateway and a reference key-manager utility. The accurate one-line description is: *React + FastAPI (Python) + Firebase + MongoDB Atlas, with a LangGraph AI pipeline.*

\newpage

# Chapter 1: Introduction to the Problem

## 1.1 Introduction

The modern computing landscape is characterised by a "Physical-Digital Gap." While digital tools excel at verifying structured data (such as CPU socket types), they often ignore the "soft" constraints of physical assembly — for example the dynamic clearance between a GPU and a front-mounted radiator. Furthermore, the local hardware market in Pakistan is fragmented and adversarial. Consumers face a "compatibility minefield" where a single selection error can lead to catastrophic failure, and the lack of transparent verification in the supply chain exposes them to counterfeit or refurbished goods sold as new.

## 1.2 Purpose

The purpose of NeuroBuilds is to bridge this gap with a "high-assistance" ecosystem. Rather than promising a "foolproof" solution — which is unattainable given unstandardised physical tolerances — the system functions as a robust Decision Support System (DSS). It empowers the general consumer with data-driven insight to mitigate the risks of assembly, compatibility, and marketplace fraud.

## 1.3 Objective

The primary objectives of NeuroBuilds are:

- To develop an intelligent **Decision Support System (DSS)** that uses an LLM and a **Hybrid RAG** architecture to translate natural-language requirements (budget, usage type) into electronically compatible PC component lists — while keeping all arithmetic and rule checking in **deterministic code**, not in the LLM.
- To implement a **real-time data-retrieval** mechanism (Tavily Search API) that supplements the internal vector database so the system can reason about newly released hardware without manual database updates.
- To establish a secure **peer-to-peer (P2P) marketplace** for computer hardware that mitigates local fraud through **WhatsApp-based OTP identity verification** of sellers.
- To integrate a **multimedia review engine** (YouTube Data API v3) that automatically fetches and filters reviews from verified technical channels (e.g., Gamers Nexus, Hardware Unboxed, Linus Tech Tips), giving users visual validation of their selected parts.
- To create a **community knowledge hub** with discussion forums and technical blogs, allowing users to validate AI recommendations against human expertise and access localised assembly guides.

## 1.4 Existing Solutions

Current solutions fail to address the specific failure modes of the local market:

- **Global tools (e.g., PCPartPicker):** focus on electronic compatibility but generally ignore physical interference zones (RAM height vs. top-mounted AIO clearance) and carry no context for the Pakistani supply chain.
- **Local marketplaces (e.g., Hafeez Center):** the physical supply chain is "adversarial." Consumers risk buying "refurbished-as-new" items or falling into the "testing trap," where defects are overlooked under high-pressure conditions. No existing digital platform verifies local seller identity to prevent synthetic-identity fraud.

## 1.5 Proposed Solution

We propose a unified ecosystem that mitigates these risks across three layers:

1. **Intelligence Layer (Hybrid RAG + deterministic verification).** To counter the hallucination problem common in generative AI, NeuroBuilds relies on a verified vector database for critical specifications and confines the LLM to two narrow roles — parsing intent and narrating results. All budget allocation and compatibility decisions are produced by **deterministic Python engines** that the LLM is explicitly forbidden to override.
2. **Trust Layer (Verification).** To combat the "Wild West" of P2P trading, the marketplace requires **WhatsApp-based OTP verification** before a seller can list, filtering out throwaway/"rented number" fraudsters.
3. **Information Layer (Review Aggregation).** To address "Day-One Blindness" for new parts, the system aggregates content from a whitelist of verified technical reviewers via the YouTube Data API, prioritising rigorous testing over entertainment content.

\newpage

# Chapter 2: Software Requirement Specification

## 2.1 Introduction

The Software Requirements Specification (SRS) describes the intended purpose and operating environment of NeuroBuilds. It documents functional and non-functional requirements so that the team and stakeholders share one understanding of the system's capabilities, constraints, and environment.

### 2.1.1 Purpose

This document defines the technical and operational specification of NeuroBuilds. Its audience includes:

- **Project supervisors & examiners** — to confirm the system meets the academic and technical standards of the FYP.
- **Development team** — as the blueprint for the React frontend, the FastAPI AI microservice, and the LangGraph AI logic.
- **Quality assurance** — as the baseline against which the application is tested.

### 2.1.2 Scope

**Product name:** "NeuroBuilds."

**The software will:**

- Generate PC component lists using an AI agent (Hybrid RAG) from user requirements (budget / usage).
- Validate **electronic** compatibility (socket, chipset, PSU transient margin, RAM generation) and provide **advisory physical-fit checks** (form factor, GPU clearance, CPU-cooler clearance).
- Provide a peer-to-peer marketplace for classified hardware listings (buy / sell / exchange).
- Fetch and display verified video reviews via the YouTube Data API.
- Host a community forum and a moderated technical blog.

**The software will NOT:**

- Process financial transactions. The marketplace is a connection platform; payment is arranged off-platform between users.
- **Guarantee** physical compatibility (e.g., exact GPU length vs. chassis clearance), because manufacturers do not publish standardised dimensional data. It is an advisory DSS.

**Consistency:** This scope is consistent with the high-level proposal approved in Phase 1; concrete technology choices have been updated to match the as-built system.

### 2.1.3 Definitions, Acronyms, and Abbreviations

- **Hybrid RAG:** an architecture combining a static vector database with real-time web retrieval to answer queries.
- **Decision Support System (DSS):** an information system that supports decision-making rather than guaranteeing an outcome.
- **Vector Database:** a database that stores data as mathematical vectors to enable semantic search.
- **Deterministic / Probabilistic Split:** the design rule that arithmetic and compatibility logic run in deterministic code, while the LLM only parses intent and narrates results.

**Acronyms:** RAG (Retrieval-Augmented Generation), LLM (Large Language Model), API (Application Programming Interface), OTP (One-Time Password), TDP (Thermal Design Power), RBAC (Role-Based Access Control), PWA (Progressive Web App), JWT (JSON Web Token).

**Abbreviations:** UOL (The University of Lahore), FYP (Final Year Project), UI/UX (User Interface / User Experience).

## 2.2 Overall Description

NeuroBuilds is a web-based application that guides users through selecting computer hardware. It integrates an intelligent build consultant, a localised marketplace, and a community hub into a single interface.

### 2.2.1 Product Perspective

NeuroBuilds replaces the need to visit several disparate platforms (Google for specs, YouTube for reviews, OLX for used parts). It depends on external data sources (Tavily, YouTube, GNews) but maintains its own logic, knowledge base, and user database.

**System interfaces:**

- **YouTube Data API v3** — video reviews and thumbnails.
- **Tavily Search API** — real-time retrieval of live hardware specifications/pricing.
- **Google Gemini** — LLM for intent parsing and result narration; Gemini embeddings for vector search.
- **Firebase Authentication** — secure identity management.
- **WhatsApp OTP gateway** — seller phone verification.

**User interfaces:**

- **AI Consultant (Chat UI)** — a terminal-styled conversational interface; users type or speak requirements and receive a streamed build card.
- **Marketplace grid** — listings with image galleries, prices, and "Message Seller."
- **Build canvas / dashboard** — a live workspace showing selected components, estimated wattage vs. PSU budget, and compatibility status.
- **Community feed** — threaded discussions with upvotes and category filters.
- **Technical blog & guides** — read-optimised long-form content with a moderated review queue.

**Hardware interfaces:** any standard device (laptop, desktop, smartphone) with a modern browser; microphone (optional, for voice); keyboard.

**Software interfaces:**

- **Operating system:** OS-agnostic (Windows, macOS, Linux, Android, iOS).
- **Browser:** Chrome, Firefox, Safari, Edge (ES6 + Web Speech API).
- **AI microservice runtime:** **Python 3 / FastAPI / uvicorn**.
- **Auxiliary Node.js runtime (v18+):** used **only** for the WhatsApp OTP gateway and the Gemini key-manager utility — not for an application backend.
- **Databases:** **Firebase Firestore** (cloud realtime NoSQL) and **MongoDB Atlas** (cloud vector + document store).

**Communications interfaces:**

- **Protocol:** all client–server traffic is over **HTTPS (TLS 1.2 / 1.3)**.
- **Data format:** **JSON** over RESTful endpoints; the AI chat endpoint streams a raw **`text/plain`** token stream (consumed as raw bytes by the client, no SSE framing).
- **Network:** a standard TCP/IP internet connection is required to reach external APIs and cloud databases.

**Memory / storage (dual-store strategy):**

- **Firebase Firestore** — **all live user data**: user profiles, roles, marketplace listings, community threads/replies, P2P chat conversations, blog posts/comments, reports, AI session history, and notifications.
- **MongoDB Atlas** — the **hardware knowledge base**: vector embeddings of component specs (RAG), the hardware catalogue, the LLM semantic cache, and a listings mirror used by the geo-search API.
- **ImgBB** — hosting of uploaded listing/thread images (only the resulting URLs are stored in Firestore).

**Operations:**

- **Caching strategy:** YouTube review results are cached client-side for **24 hours** (`sessionStorage`); GNews headlines are cached for 24 hours (`localStorage`). On the backend, an optional MongoDB Atlas **semantic cache** intercepts repeated LLM calls. These caches keep the system within external API quotas.
- **Backups:** automated daily backups are handled by the cloud providers (MongoDB Atlas and Google Cloud / Firebase).

**Site-adaptation requirements:** the system is cloud-native SaaS; no local installation is required. The only deployment prerequisite is valid DNS for the domain and reachable cloud services.

### 2.2.2 Product Functions

The major modules are the **AI-Driven Consultant**, the **Peer-to-Peer Marketplace**, the **Community & Blog Hub**, the **Multimedia Review Engine**, and **Administration & Moderation**. The functional-requirement tables follow.

| Field | Detail |
|---|---|
| **ID** | FR_01 |
| **Name** | Generate AI Build |
| **Description** | The user interacts with the AI agent via voice or text to receive a custom PC configuration. |
| **Input** | User requirements (budget, usage); optional voice command (microphone). |
| **Output** | A streamed, narrated build card of compatible components (CPU, GPU, motherboard, RAM, PSU) with estimated prices and a power-budget check. |
| **Requirements** | Internet connectivity; FastAPI AI service reachable (else local mock fallback). |
| **Basic flow** | 1. User types/speaks requirements (e.g., "Gaming PC for 150k"). 2. `search_node` fetches live prices (Tavily); `rag_node` runs vector recall (MongoDB). 3. `intent_node` (LLM, temp = 0) extracts a structured `BuildIntent`. 4. `selection_node` allocates the budget; `compatibility_node` runs 9 deterministic checks. 5. `response_node` streams the narration; the frontend parses the build into the Build Canvas. |

*Table 1 — FR_01: Generate AI Build*

| Field | Detail |
|---|---|
| **ID** | FR_02 |
| **Name** | Check Compatibility |
| **Description** | The system validates whether selected components are electronically compatible and physically plausible. |
| **Input** | Selected components (motherboard, CPU, RAM, GPU, PSU). |
| **Output** | A pass/fail result with itemised issues and warnings (e.g., "Socket mismatch", "PSU transient margin low", "GPU clearance advisory"). |
| **Requirements** | Access to the deterministic `validation_engine.py`. |
| **Basic flow** | 1. Components arrive from the AI build or manual selection. 2. The engine cross-references socket, PSU transient margin, RAM generation, BIOS-flash advisory, bottleneck %, form factor and clearance. 3. The UI shows a pass (green) or fail (red) status with details. |

*Table 2 — FR_02: Check Compatibility*

| Field | Detail |
|---|---|
| **ID** | FR_03 |
| **Name** | Create Marketplace Listing |
| **Description** | A user posts an advertisement to sell, buy, or exchange a hardware component. |
| **Input** | Title, description, price, condition, listing type, location, up to 6 images. |
| **Output** | The listing appears on the marketplace grid. |
| **Requirements** | User logged in; verified phone number for sellers. |
| **Basic flow** | 1. User opens "Create Listing". 2. User fills details and uploads images (ImgBB). 3. The system validates input. 4. The listing is written to the Firestore `listings` collection with `status: active`. |

*Table 3 — FR_03: Create Marketplace Listing*

| Field | Detail |
|---|---|
| **ID** | FR_04 |
| **Name** | Seller Verification |
| **Description** | Verifies a seller's identity to reduce fraud. |
| **Input** | Mobile phone number (E.164); OTP code. |
| **Output** | A "Verified Seller" status on the user profile. |
| **Requirements** | WhatsApp OTP gateway reachable. |
| **Basic flow** | 1. User requests verification. 2. The backend asks the WhatsApp gateway to deliver a 6-digit OTP. 3. User enters the OTP. 4. On success, the system writes `{ isVerified: true, phoneNumber }` to `users/{uid}`. |

*Table 4 — FR_04: Seller Verification*

| Field | Detail |
|---|---|
| **ID** | FR_05 |
| **Name** | Fetch YouTube Reviews |
| **Description** | Automatically retrieves trusted video reviews for a component. |
| **Input** | Component model name (e.g., "RTX 3060"). |
| **Output** | Up to three embedded reviews from verified technical channels. |
| **Requirements** | YouTube Data API key; internet. |
| **Basic flow** | 1. User opens a component detail. 2. The system checks the 24-hour `sessionStorage` cache. 3. On a miss, it calls the YouTube API and caches the result. 4. Videos are embedded in the UI; on HTTP 403 (quota) it degrades to a search link. |

*Table 5 — FR_05: Fetch YouTube Reviews*

| Field | Detail |
|---|---|
| **ID** | FR_06 |
| **Name** | Create Community Post |
| **Description** | A user creates a forum thread to ask for help or showcase a build. |
| **Input** | Title, body (markdown), category, country, optional images. |
| **Output** | The thread is visible in the community feed. |
| **Requirements** | Firestore access; user logged in. |
| **Basic flow** | 1. User opens "Create Thread". 2. User writes content. 3. The thread is written to the Firestore `threads` collection. 4. It appears in the relevant category feed in real time. |

*Table 6 — FR_06: Create Community Post*

### 2.2.3 User Characteristics

NeuroBuilds targets a broad demographic and requires no formal technical education to operate:

- **General home user (non-technical):** basic literacy and web browsing; relies entirely on the AI consultant to translate plain requests into specifications.
- **Industry professional (content creators, architects, programmers):** expert in their software domain but possibly not in hardware; needs the system to map workloads to capable hardware within budget.
- **Student / gamer:** familiar with gaming terms but may not know power constraints; uses the system to maximise price-to-performance and to validate builds against the community.
- **Marketplace vendor:** familiar with local pricing; needs only to verify identity via OTP and upload photos. (The system additionally supports a `vendor` role with simple inventory/stock controls.)

**General constraint:** the system assumes basic digital literacy (keyboard, mouse, or microphone) but abstracts away hardware complexity so a non-expert can build as effectively as an expert.

### 2.2.4 Constraints

**Regulatory policies**

- **Liability disclaimer:** NeuroBuilds is a DSS — an advisor, not a guarantor. The UI and documentation state explicitly that final responsibility for assembly and physical compatibility rests with the user.
- **Data privacy:** phone numbers used for verification are handled in line with standard data-protection practice (GDPR-like / local PECA), stored securely and never shared with advertisers.

**Hardware / platform limitations**

- **Client connectivity:** the AI consultant and live search require a persistent broadband connection; offline, the app degrades to cached/read-only behaviour.
- **AI response budget:** the frontend imposes a **10-second timeout** on the AI request; if the FastAPI service does not respond in time, the client streams a local **mock fallback** so the UI never dead-ends. (This is a client-side resilience limit, not a serverless function timeout.)

**Interfaces to other applications**

- **YouTube Data API quota** (10,000 units/day) is conserved by a **24-hour** review cache; live fetching stops gracefully when quota is exhausted (deep-link fallback).
- **Tavily search depth** is kept shallow to maintain response speed.

**Parallel operation**

- The FastAPI service uses async I/O to serve concurrent requests; the MongoDB Atlas free tier (M0) caps concurrent connections (~500), which bounds simultaneous vector searches during testing.

**Audit functions**

- Sensitive marketplace and moderation actions are logged (user ID, timestamp) to assist fraud and abuse investigations.

**Control functions**

- Administrators can freeze accounts, hide listings/threads, moderate the blog queue, and reassign roles. Role changes are performed only through a server-guarded endpoint that updates both the Firestore role and the JWT `admin` claim.

**Higher-order language requirements**

- **Type safety:** the frontend uses **TypeScript**.
- **AI logic:** the AI orchestration is written in **Python** (LangChain / LangGraph).

**Signal / handshake protocols**

- **API authentication:** privileged backend endpoints require a **Firebase JWT Bearer token** verified by the Admin SDK (`require_admin` / `require_auth`). The FastAPI service authenticates to the WhatsApp gateway with a **shared Bearer secret**.
- **Security handshake:** all traffic is constrained to **TLS 1.2 / 1.3**; plain HTTP is rejected.

**Reliability requirements**

- **AI determinism:** the intent-extraction LLM call runs at **temperature 0**, and all numeric/compatibility decisions run in deterministic engines the LLM cannot override.
- **Compatibility accuracy:** the system guarantees **electronic** compatibility (socket, chipset, RAM generation, PSU margin) and provides **advisory** physical-fit checks; it does not guarantee exact physical clearance due to missing standardised dimensional data.

**Criticality**

- The marketplace module is **business-critical** (user data); the build guide is **non-safety-critical**. A recommendation error causes inconvenience, not physical harm, given the DSS framing.

**Safety & security**

- **Marketplace trust:** sellers must complete OTP verification before listing.
- **Safety warnings:** the build-guide section displays mandatory safety prompts (e.g., "disconnect power before assembly").

### 2.2.5 Assumptions and Dependencies

**Assumptions**

- **Continuous internet connectivity:** the AI agent and live search cannot function offline; on loss of connectivity the system degrades to cached data.
- **Third-party data accuracy:** specifications retrieved via Tavily and reviews via YouTube are assumed accurate; the system cannot independently verify third-party data.
- **User digital literacy:** users can navigate a browser, optionally use a microphone, and read instructions.
- **Hardware standardisation:** manufacturers continue to follow current standards (ATX form factors, PCIe, DDR4/DDR5); a radical architectural shift would invalidate parts of the compatibility logic.

**Dependencies**

- **Google Gemini** (LLM + embeddings) and the **Tavily Search API** — downtime, rate-limiting, or pricing changes directly affect build generation. A Gemini **key-pool rotation manager** mitigates per-key rate limits.
- **YouTube Data API v3** — quota or policy changes would require re-engineering the review engine.
- **Cloud infrastructure** — MongoDB Atlas (vectors) and Firebase (auth + realtime data); availability is tied to provider SLAs.
- **Browser compatibility** — a modern browser supporting ES6 and the Web Speech API; legacy browsers are unsupported.

### 2.2.6 Apportioning of Requirements

Deferred to future versions:

- **Integrated payment gateway / escrow** — current scope is P2P connection only.
- **Advanced physical-compatibility engine** — a full 3D-clearance model awaits standardised manufacturer dimensional data.
- **Native mobile applications** — the current product is a PWA.
- **Automated fraud-detection AI** — current fraud prevention is OTP verification plus community reporting and moderation.
- **Authorised repair-centre integration** and **AR chassis visualisation** — future ecosystem expansions.

## 2.3 Specific Requirements

### 2.3.1 Functional Requirements

**User Management & Authentication.** Visitors register via email/password or Google OAuth (Firebase Auth), with optional TOTP 2FA. Authenticated users can save AI sessions, post in forums, and trade. To list items, a user must verify a phone number via a **WhatsApp OTP** flow. The system enforces a four-tier RBAC model (`user`, `vendor`, `moderator`, `admin`); role changes occur only through a server-guarded endpoint that keeps the Firestore role and the JWT `admin` claim in sync.

**AI-Driven Build Consultant.** The consultant accepts text or voice and runs a **6-node LangGraph pipeline**: live web search (Tavily) → vector recall (MongoDB) → LLM intent extraction (temperature 0) → deterministic budget allocation → deterministic 9-tier compatibility validation → LLM narration. The LLM is restricted to parsing intent and narrating; it cannot recalculate or contradict the deterministic engines.

**Peer-to-Peer Marketplace.** Verified sellers create listings (images via ImgBB, location, condition, price, optional catalogue link). Buyers filter by price, location, or model and contact sellers through an in-app real-time chat (1:1 and group). Listings, chat, and all related data live in Firestore.

**Community & Multimedia Content.** Users create threads, reply, and vote (Firestore transactions). When viewing a component, the multimedia engine embeds YouTube reviews from verified channels. Administrators publish guides/blogs through a moderated review queue; an optional AI "Blog Automator" can draft posts that still pass through human review.

**Administration & Moderation.** Administrators monitor activity, hide listings/threads, resolve reports, reassign roles, and read platform analytics (most-commented blogs, top categories, most-saved listings) plus a thesis-evaluation telemetry panel.

### 2.3.2 Non-Functional Requirements

**Usability**

- **Responsive design** across desktop, tablet, and mobile (Tailwind CSS).
- **Accessibility:** voice input via the Web Speech API.
- **Simplicity:** the AI consultant produces a complete build from a single natural-language prompt.

**Reliability**

- **Availability:** the system targets high availability via managed cloud infrastructure (Firebase / MongoDB Atlas).
- **Data integrity / graceful degradation:** if Tavily or the AI service is unavailable, the pipeline falls back to internal data; if the AI service times out (10 s), the client streams a local mock so the UI never errors out.
- **Recoverability:** user data is backed up daily by the cloud providers.

**Performance**

- **AI response:** the consultant streams a build within the 10-second client budget; tokens stream incrementally so the user sees output immediately.
- **Rendering speed:** target First Contentful Paint under ~1.5 s on 4G.

**Design constraints**

- **API quotas:** a 24-hour review cache keeps the system within the YouTube quota.
- **Physical limitations:** compatibility logic guarantees electronic fit and gives advisory physical-fit checks only.

**Portability**

- **Browser- and OS-independent** web application; installable as a PWA.

**Maintainability**

- **Decoupled architecture:** independent frontend, FastAPI AI microservice, and standalone OTP gateway.
- **Type safety:** TypeScript on the frontend.
- **Documentation:** FastAPI auto-generates OpenAPI/Swagger documentation for the AI service endpoints.

**License**

- **Academic license** (FYP, The University of Lahore); complies with the MIT / Apache 2.0 licenses of the open-source libraries used (React, LangChain, Tailwind, etc.). YouTube content remains the property of its creators.

\newpage

# Chapter 3: Use Cases (Corrected Prose)

> The PlantUML sources for Figures 1–6 are in `NeuroBuilds_FYP_Phase2.md §4.0`. The descriptions below correct the external-actor labels (WhatsApp OTP gateway, not "SMS Gateway"; ImgBB for image hosting) and the data-store references.

## 3.0 Aggregated Use-Case Diagram

The aggregated diagram is the system-wide blueprint. Human actors form a **generalisation hierarchy**: a *Guest Visitor* has read-only reach (search marketplace, read guides, view component details); a *Registered User* inherits that and gains the interactive core (generate a build, contact sellers, post in the forum); a *Verified Seller* inherits everything a user can do and additionally earns the exclusive right to post listings. The *System Admin* is kept off the inheritance chain to enforce **separation of duties**. The external (secondary) actors are **Tavily Search API**, **YouTube Data API**, the **WhatsApp OTP gateway**, and **ImgBB** (image hosting). `<<include>>` edges mark mandatory sub-behaviour (generating a build always checks compatibility and fetches specs; posting a listing always verifies the phone and uploads images), while `<<extend>>` edges mark optional augmentation (voice input, embedded video).

## 3.1 Use Case — The AI Build Engine

The AI engine is the headline feature, modelled as a **Hybrid RAG** flow. The mandatory spine — *analyse intent → query vector DB → validate compatibility → generate build card* — always executes. The single `<<extend>>` on *Fetch Live Specs* is the crux of the "hybrid" claim: the system reaches out to **Tavily** primarily to obtain live pricing and to cover parts newer than the last ingestion. *Validate Compatibility* is an always-on `<<include>>`: **no build card is produced without first passing the deterministic compatibility engine.**

| Field | Detail |
|---|---|
| **Use Case ID** | UC-01 |
| **Name** | Generate AI PC Build |
| **Description** | The user interacts with the AI consultant (text or voice) to receive a customised parts list based on budget and performance needs. |
| **Primary Actor** | Registered User |
| **Secondary Actors** | Tavily Search API; MongoDB Atlas (vector store); Google Gemini (LLM) |
| **Pre-condition** | User is on the AI builder page; internet connection active. |
| **Post-condition** | A complete build configuration is streamed and displayed; the session is auto-saved to `users/{uid}/aiSessions`. |
| **Basic flow** | 1. User speaks or types requirements ("Gaming PC for 150k"). 2. Web Speech API converts voice to text if needed. 3. `intent_node` (temp = 0) extracts budget and use-case. 4. `rag_node` queries the MongoDB vector DB; `search_node` fetches live prices via Tavily. 5. `selection_node` allocates budget; `compatibility_node` validates (socket, PSU margin, RAM, form factor). 6. `response_node` streams a narrated build card. 7. The frontend renders the Build Canvas. |
| **Alternate flows** | **(A1) Live data needed:** `search_node` augments internal recall with Tavily results for new or unpriced parts, then resumes. **(A2) Budget too low:** the pipeline streams a "budget too low for a functional PC" advisory and ends. **(A3) AI service unreachable:** after a 10-second client timeout, a local mock build is streamed. |

*Table 7 — UC-01: Generate AI PC Build*

## 3.2 Use Case — Marketplace & Security Logic

Every *Create Listing* attempt fans out into three mandatory sub-routines: *check verification status*, *validate inputs* (no invalid price, no profanity), and *upload images*. Images are uploaded to **ImgBB**; only the returned URLs are persisted to the Firestore **`listings`** document, keeping binary media off the realtime database. The conditional `<<extend>>` to *Verify Phone Number* fires only when the seller is not yet verified, redirecting them into the WhatsApp OTP flow before any listing can persist.

| Field | Detail |
|---|---|
| **Use Case ID** | UC-02 |
| **Name** | Create Marketplace Listing |
| **Description** | A verified seller posts a hardware component for sale on the P2P marketplace. |
| **Primary Actor** | Verified Seller |
| **Secondary Actors** | Firestore (`listings`); ImgBB (images) |
| **Pre-condition** | User logged in **and** `isVerified = true`. |
| **Post-condition** | A new listing is visible in the marketplace with `status: active`. |
| **Basic flow** | 1. User opens "Create Listing". 2. Selects category and model. 3. Uploads up to 6 photos (ImgBB). 4. Enters price, condition, location. 5. System validates inputs. 6. Image URLs + metadata are written to Firestore with `status: active`. 7. Success message shown. |
| **Alternate flows** | **(A1) Unverified user:** the system redirects to UC-03 (Verify Phone Number). **(A2) Upload failure:** an ImgBB upload error is shown and form data is preserved for retry. |

*Table 8 — UC-02: Create Marketplace Listing*

## 3.3 Use Case — Verify Phone Number

This use case elevates a Registered User to a Verified Seller. The system asks the backend to dispatch a 6-digit OTP through the **WhatsApp gateway**, then awaits the user's input. The two-step request/submit shape models the asynchronous round-trip through the external channel; a wrong or expired code never reaches the badge step.

| Field | Detail |
|---|---|
| **Use Case ID** | UC-03 |
| **Name** | Verify Phone Number |
| **Description** | A user links a valid mobile number to unlock seller privileges. |
| **Primary Actor** | Registered User |
| **Secondary Actor** | WhatsApp OTP Gateway |
| **Pre-condition** | User logged in with `isVerified = false`. |
| **Post-condition** | `users/{uid}` updated with `isVerified = true` and `phoneNumber`. |
| **Basic flow** | 1. User enters a mobile number (E.164). 2. The backend asks the WhatsApp gateway to send a 6-digit OTP. 3. User enters the code. 4. The backend compares it server-side. 5. On match, `users/{uid}` is updated and the verified badge is granted. |
| **Alternate flows** | **(A1) Incorrect OTP:** "invalid code" error; limited retries. **(A2) Resend:** after 60 s the user can request a new OTP, invalidating the old one. |

*Table 9 — UC-03: Verify Phone Number*

> **Implementation note.** The WhatsApp gateway (`whatsapp-web.js`) is built and functional, but the live verification path currently uses a hardcoded mock OTP (`123456`); wiring the gateway into the flow is an in-progress task.

## 3.4 Use Case — View Component Reviews

This models the **cache-first** review pipeline that keeps the system within the YouTube Data API quota. Opening a component detail always checks the **24-hour `sessionStorage` cache** first; an external API call is an `<<extend>>` that happens only on a cache miss. A second `<<extend>>` — a deep-link fallback — fires on HTTP 403 (quota exhausted), degrading to a plain search link rather than crashing.

| Field | Detail |
|---|---|
| **Use Case ID** | UC-04 |
| **Name** | View Component Reviews |
| **Description** | The user views video reviews for a part without leaving the application. |
| **Primary Actor** | Guest / Registered User |
| **Secondary Actor** | YouTube Data API v3 |
| **Pre-condition** | User is viewing a component detail (e.g., RTX 3060). |
| **Post-condition** | The player is loaded; results are cached for 24 hours. |
| **Basic flow** | 1. User opens a component detail. 2. The system checks the 24-hour cache. 3. **Hit:** stored video IDs are used. 4. **Miss:** the YouTube API is queried for verified-channel reviews. 5. Up to three videos are embedded. 6. Results are cached (TTL 24 hours). |
| **Alternate flow** | **(A1) Quota exceeded (403):** the system falls back to a "Search on YouTube" link and logs the event. |

*Table 10 — UC-04: View Component Reviews*

## 3.5 Use Case — Manage Blog Content

The CMS use case shows **two authors and one gate**. A human admin authors and reviews; an AI *Blog Automator* (an Actor-Critic agent) can auto-generate a draft. Crucially, the automator's output is not published directly — it `<<include>>`s the same **review queue** a human post must pass through. Approving a post can optionally `<<extend>>` into scheduled publishing. The lifecycle is `draft → pending_review → published` (or `scheduled`), with `reject` returning a post to `draft` with a note.

| Field | Detail |
|---|---|
| **Use Case ID** | UC-05 |
| **Name** | Manage Blog Content |
| **Description** | An administrator (or the AI automator, via review) publishes educational guides or market news. |
| **Primary Actor** | System Admin |
| **Secondary Actor** | Firestore (`blogs`); optional Blog Automator (AI agent) |
| **Pre-condition** | User logged in with the `admin` JWT claim. |
| **Post-condition** | An approved article is live on the blog feed. |
| **Basic flow** | 1. Admin opens the review console / editor. 2. Enters title, markdown content, thumbnail, category. 3. Approves a post for immediate publish. 4. The post is written to Firestore with `status: published`; the realtime feed updates. |
| **Alternate flows** | **(A1) Schedule:** approve with a future `publishAt` → `status: scheduled`. **(A2) Reject:** the post returns to `draft` with a `rejectionNote`. **(A3) AI draft:** the automator creates a `pending_review` post that an admin must approve. |

*Table 11 — UC-05: Manage Blog Content*

\newpage

# Chapter 4: Design (Corrected Prose)

> PlantUML sources for Figures 7–27 are already correct in `NeuroBuilds_FYP_Phase2.md §§4.1–4.10`. The prose below replaces the Phase 1 descriptions that referenced a non-existent Node.js/Express API gateway, MongoDB-stored listings, Firebase-Storage images, an SMS gateway, and a 30-day listing archive.

## 4.1 Architecture Diagram

NeuroBuilds is a **decoupled, polyglot, four-tier architecture** — *not* a MERN application and **with no Node/Express API gateway**.

- **Client Tier.** A single React + TypeScript **PWA** (Tailwind CSS). It talks to **two** backends in parallel: it streams AI requests to **FastAPI** over HTTPS, and it speaks **directly** to **Firebase Firestore** through the realtime SDK for all live social/marketplace data. This dual-path design is why the marketplace and community feel instant without polling the Python service. Firebase Auth manages sessions client-side.
- **Application Tier (FastAPI · Python).** The AI brain: a **LangGraph** pipeline flanked by two deterministic engines (`selection_engine.py` — Layer B; `validation_engine.py` — Layer C), a **Gemini key-pool manager**, a MongoDB **semantic cache**, and a **Firebase-JWT auth guard** for privileged endpoints.
- **Data Tier.** Storage is split by access pattern: **MongoDB Atlas** holds vectors and the hardware catalogue (semantic search); **Firestore** holds all realtime social/marketplace/blog documents; **ImgBB** hosts images.
- **External Services.** Gemini (LLM), Tavily (search), YouTube (reviews), and the WhatsApp OTP gateway are isolated behind the application tier so quota limits and outages are absorbed centrally.

The most important reading: **the LLM is reached only through the key-pool manager and only for intent parsing and narration. The deterministic engines sit on a separate path that never touches the LLM.** Because the React frontend reaches Firebase directly and FastAPI independently, a Firebase outage does not take down the AI service, and vice versa — independent scaling and fault isolation by design.

## 4.2 Entity Relationship Diagram (with Data Dictionary)

The ERD captures the platform's **dual-store reality** in one logical model. `User` is the hub: it owns AI sessions and authors every kind of user content (listings, threads, replies, blog posts) — all 1:N. Two structural decisions matter most:

- **`BuildItem` is an associative (bridge) entity** resolving the M:N relationship between a saved/active build and `Component`; deleting a build cascade-deletes its items but never the underlying catalogue component.
- The **`Component ↔ Listing` relationship is optional** — a seller *may* link a listing to the official catalogue to auto-populate trustworthy specs, but a listing can stand alone.

**Data-dictionary notes.** `Component.embedding` is the **768-dimension Gemini vector** that powers semantic RAG search (stored in MongoDB Atlas). `User.role` (`user | vendor | moderator | admin`) drives RBAC and is immutable to non-admins (enforced in `firestore.rules`). `Listing.status` ∈ `{active, sold, reserved, hidden}` — `hidden` is the moderation flag. `BlogPost.authorType` distinguishes human from AI-agent authorship. `YouTubeCache.expires_at` is a **24-hour** TTL on the client cache.

> **Store mapping clarification.** `User`, `Listing`, `Thread`, `Reply`, and `BlogPost` are **Firestore** collections; `Component` (with its vector embedding) and the hardware catalogue live in **MongoDB Atlas**. The original ERD prose that placed listings/inventory in MongoDB has been corrected.

## 4.3 Data Flow Diagrams

### Level 0 (Context)

The context diagram collapses the platform into a **single process** and shows only what crosses the boundary: two human external entities (User, Admin) and three external service clouds (Tavily/Gemini for reasoning, YouTube for reviews, the WhatsApp OTP gateway for verification). User requirements go in and build cards come out; admin moderation goes in and analytics come out.

### Level 1

Level 1 explodes the single process into **five cooperating processes** (Auth & Verification, AI Build Engine, Marketplace, Community & Blog, Review Aggregation) over **five data stores**, making the dual-database strategy explicit: D1 (Users), D3 (Listings), and D4 (Threads/Blogs) live in **Firestore**; D2 (Hardware vectors) and D5 (review cache) live in **MongoDB**. The cross-store link that matters most is the Marketplace process reading both its own listings (Firestore) and the hardware catalogue (MongoDB) for catalogue-linked listings. The Admin interacts only with the Marketplace and Community/Blog processes — never the AI engine — reinforcing separation of duties.

## 4.4 Class Diagram

The class model has two clusters.

- **Domain / RBAC cluster.** `User → Seller → Admin` via inheritance, plus `Listing`, `Thread`, `BlogPost`. `Seller` adds verification state and listing creation; `Admin` adds privileged moderation operations.
- **AI-pipeline cluster.** `LangGraphPipeline` orchestrates six node-methods over a single shared `BuildState` (a TypedDict threading context between nodes). It depends on `BuildIntent` (the structured output of the LLM intent node) and on two **stereotyped deterministic classes** — `ValidationEngine <<Layer C>>` and `SelectionEngine <<Layer B>>`. These stereotypes are a contract, not decoration: the engines contain **all** arithmetic and rule logic and expose pure functions (`run_checks`, `run_allocation`) with **no LLM dependency**.

> The Phase 1 prose referred to `AI_Controller`, `Marketplace_Controller`, and `vectorDB_Client`. These names do not exist in the codebase; the accurate classes are `LangGraphPipeline`, `BuildState`, `BuildIntent`, `ValidationEngine`, and `SelectionEngine`.

## 4.5 Activity Diagram — Generate PC Build

The build flow maps onto the **six LangGraph nodes**. Optional speech-to-text feeds the prompt; the request flows through `search_node` (live prices) and `rag_node` (vector recall), then `intent_node` converts free text into a structured `BuildIntent` at **temperature 0**. A guard rejects sub-threshold budgets early. The core loop is the **retry feedback edge**: if the deterministic compatibility node (Layer C) rejects the allocator's choice (Layer B), the offending part is blacklisted and allocation re-runs — a self-correcting loop that converges on a valid build **without asking the LLM to fix anything**. Only then does `response_node` (Layer D) narrate the build as a token stream, which the frontend parses into the live Build Canvas and auto-saves as a session.

### Activity — Create Marketplace Listing

Three guards run in priority order — authentication, then phone verification, then input validation — so a request is rejected at the earliest point and never wastes work (an unverified user is bounced before uploading images). The happy path uploads images to **ImgBB**, then writes the `listings/{id}` document to **Firestore** with `status: active`.

### Activity — Phone Verification

Verification is a single-decision flow whose guard checks **both correctness and freshness** (matches *and* not expired). A pass writes `isVerified = true` and the phone number to the user profile and grants the seller badge; a failure loops back with an error and changes no state. The send is modelled as its own activity ("**WhatsApp gateway** sends OTP") to make the trust boundary explicit.

## 4.6 Sequence Diagram — Generate AI PC Build

This is the most important sequence. The React PWA performs any speech-to-text locally, then sends `POST /api/chat` **directly to FastAPI** (there is no intermediate Node gateway). FastAPI runs `run_pipeline()`: Tavily once for live pricing, MongoDB twice (vector recall, then priced selection), and the **Gemini LLM exactly twice** (intent, then narration). The `compatibility_node` is a **self-message on LangGraph** (pure in-process Python, no external participant). The response leg is a **`text/plain` token stream** back to the client, where `extractBuild()` incrementally updates the Build Canvas. The runtime proof of the thesis: **the expensive, hallucination-prone LLM calls bracket the flow, but the decision about whether a build is safe happens entirely off the LLM lifeline.**

### Sequence — Phone Verification

Verification is **server-mediated**: FastAPI sits between the client and the WhatsApp gateway, and the call to the gateway carries a **shared Bearer secret** so only the trusted backend can trigger an OTP send. The two-request shape (`request` then `confirm`) is separated by the out-of-band delivery; the Firestore write that flips `isVerified` happens only inside the confirm leg, server-side.

### Sequence — Create Marketplace Listing

A `loop` fragment uploads each image (≤ 6) to **ImgBB**; only the returned public URLs — not the binaries — are written to the **Firestore** listing document. This keeps heavy media off the realtime database.

## 4.7 Collaboration Diagram — Generate AI Build

The collaboration diagram conveys the same interaction as the sequence diagram but emphasises object structure: numbered messages encode call order. **LangGraph is the central coordinator** that fans out to four collaborators — MongoDB, the SelectionEngine, the ValidationEngine, and the Gemini LLM — and the LLM streams back to the UI. Placing `ValidationEngine` and `SelectionEngine` as first-class objects beside `Gemini` visually reinforces that they are **peers of the LLM, not subordinate to it**. (There is no `API_Gateway` object; the React client calls FastAPI directly.)

## 4.8 State Transition Diagrams

### AI Build Session

From `Streaming` there are two exits: the normal one parses a JSON build block into `BuildExtracted`; the failure one — a **10-second client timeout** — routes into `MockFallback`, which still converges on `BuildExtracted`. Whether the live backend answers or not, the user always reaches a usable build and a saved session.

### User Account (Identity & Verification)

The lifecycle shows **two independent verification axes** (email and phone) plus an administrative override. The OTP state has a self-protecting pair of edges — a correct code promotes to `VerifiedSeller`; a wrong/expired code falls back with no privilege gained. The `VerifiedSeller ⇄ Suspended` cycle gives admins reversible enforcement.

### Community Forum (Thread Lifecycle)

A thread is born **`active`**; most interactions (votes, replies) are self-transitions that change content without changing lifecycle state. The author can mark a thread **`solved`** (`lifecycleStatus`), and a moderator can move it to **`hidden`**; both are reversible. *(Corrected: the codebase has no "drafting", "locked", or hard-"deleted" thread states — those belong to the **blog** lifecycle: `draft → pending_review → published/scheduled`, with reject → draft.)*

### Marketplace Listing (Item Lifecycle)

A listing's status is one of **`active`, `reserved`, `sold`, `hidden`**. A buyer can commit (`reserved`) and back out (`→ active`); `sold` is reachable from `reserved` or directly; `hidden` is the reversible moderation branch. *(Corrected: there is no "pending validation" state and no automatic 30-day archive — those were aspirational and are not implemented.)*

## 4.9 Component Diagram

The component diagram maps the logical architecture onto **actual source artifacts**, doubling as a repository guide. Three deployable components are shown:

- **Frontend (Vite/React/TS):** pages & routing, hooks (`useAIAssistant`, `useMarketplace`, …), `telemetryTracker.ts`, and the PWA service worker.
- **AI Microservice (FastAPI):** `main.py` (routes), `agent.py` (LangGraph), `validation_engine.py`, `selection_engine.py`, `location_search.py`, `cache_manager.py`, `gemini_manager.py`, `routers/blog_automator.py`, `services/auth_guard.py`.
- **OTP Gateway (Node):** `whatsapp-web.js`.

The wiring confirms two claims at file level: the frontend hooks reach **Firebase directly** (bypassing FastAPI) for realtime data, and the OTP gateway is reached only over a **Bearer-authenticated** link from `main.py`. There is **no Node.js API gateway** and **no DAO layer in front of Firestore** — the client uses the Firestore SDK directly, with security enforced by `firestore.rules`.

## 4.10 Deployment Diagram

The deployment diagram shows the physical distribution of artifacts. The browser/PWA node fans out to **three** independent endpoints: a static host/CDN for assets, the **FastAPI app server (uvicorn)** for AI work, and **Firebase directly** for auth and realtime data. The **WhatsApp OTP gateway is a separate host** (it holds a long-lived WhatsApp session via Puppeteer and must survive restarts independently of the stateless API). The cloud nodes — **MongoDB Atlas**, **Firebase**, and the third-party APIs (Gemini, Tavily, YouTube) — are managed services.

> **Corrected:** the backend is a **standalone, long-running FastAPI/uvicorn service**, not a set of Vercel serverless functions, and there is **no Node.js serverless API gateway**. The static React build may be hosted on any CDN/static host (e.g., Vercel/Netlify), but the AI microservice runs as a persistent process.
