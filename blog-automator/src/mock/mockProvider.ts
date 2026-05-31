import type { BlogState, CritiqueReport } from '../types';

export const MOCK_RESEARCH = `## AI Summary
Artificial intelligence is fundamentally transforming personal computing, moving from cloud-dependent
services toward on-device intelligence. This shift is powered by dedicated Neural Processing Units
(NPUs) now embedded in consumer-grade processors, enabling privacy-preserving, low-latency AI
features without internet connectivity.

---

### [1] NPU Integration in Consumer CPUs
**URL:** https://example.com/npu-consumer-chips
**Relevance:** 95%

AMD Ryzen AI 300 series and Intel Core Ultra processors now ship with dedicated NPUs capable of
40–50 TOPS (Tera Operations Per Second). This enables real-time AI workloads — background noise
cancellation, super-resolution gaming, local LLM inference — without requiring discrete GPU
acceleration.

---

### [2] On-Device LLM Inference Breakthroughs
**URL:** https://example.com/local-llm-edge
**Relevance:** 89%

Models such as Phi-3 Mini (3.8B parameters) and Llama 3.2 (1B/3B) now run entirely offline on
modern laptops with 16 GB of RAM at 15–40 tokens per second. GGUF 4-bit quantization reduces model
memory footprint by ~75% with minimal quality degradation, making interactive local inference
commercially viable for the first time.

---

### [3] Privacy as a Primary Driver
**URL:** https://example.com/ai-privacy-local
**Relevance:** 83%

Gartner's 2024 survey found 67% of enterprise users prefer on-device AI explicitly for data
sovereignty. Healthcare, legal, and financial sectors face strict data-residency regulations that
cloud inference structurally cannot satisfy — local inference eliminates that risk architecturally.

---

### [4] Operating System Integration
**URL:** https://example.com/os-ai-integration
**Relevance:** 77%

Microsoft Copilot+ PCs and Apple's Neural Engine are integrating on-device AI directly into the OS
layer. Features like real-time translation, semantic search across local files, and live transcription
run fully on-device with no data leaving the machine.`;

export const MOCK_DRAFT = `# The Future of AI in Personal Computing: Intelligence at the Edge

The next revolution in personal computing isn't arriving from a distant data centre — it's already
sitting on your desk. As dedicated AI silicon becomes standard in consumer processors, the era of
**on-device intelligence** is quietly redefining what a laptop or desktop can do.

## From Cloud Dependency to Local Inference

For the past decade, "AI" meant routing data to a remote server and waiting for a response. Search
queries, image recognition, voice commands — all processed in centralised data centres. This model
worked, but it carried inherent trade-offs: latency, internet dependency, and exposure of potentially
sensitive data to third-party infrastructure.

That calculus is shifting. AMD's Ryzen AI 300 series and Intel's Core Ultra processors now ship with
dedicated Neural Processing Units (NPUs) rated at 40–50 TOPS. These aren't marketing figures — they
represent real silicon dedicated to matrix multiplication, the fundamental operation powering modern
neural networks.

## What NPUs Actually Enable

The practical applications arriving in 2024–2025 are more grounded than the futurist pitch:

- **Real-time noise cancellation** — background audio suppression without cloud round-trips
- **AI-assisted upscaling** — frame generation in DLSS 4 and FSR 4 via NPU acceleration
- **Local document summarisation** — processing confidential files without leaving the machine
- **Offline voice transcription** — Whisper-class accuracy at native speed on commodity hardware

The crucial distinction is latency. Cloud inference for a voice command takes 200–800 ms round-trip.
On-device NPU inference completes in 20–50 ms — a 10× improvement that crosses the threshold of
human perception and enables genuinely interactive experiences.

## The Quantisation Breakthrough

Running large language models locally was impractical eighteen months ago. A GPT-class model
required 70+ GB of VRAM — the province of research labs and well-funded startups.

Quantisation changed the equation. By reducing model weight precision from 32-bit floats to 4-bit
integers (GGUF format), model sizes shrink by approximately 75% with minimal quality degradation.
Meta's Llama 3.2 (3B parameters) now fits comfortably in 2 GB of RAM and runs at 15–40 tokens per
second on a laptop CPU — fast enough for interactive use cases.

Microsoft's Phi-3 Mini demonstrates this concretely: 3.8 billion parameters, trained on carefully
curated high-quality data, achieving GPT-3.5-level performance on reasoning benchmarks while fitting
inside 4 GB of memory.

## Privacy as a Structural Guarantee

Gartner's 2024 survey found **67% of enterprise users** prefer on-device AI specifically because of
data sovereignty requirements. Healthcare providers, legal firms, and financial institutions face
strict regulations about where sensitive data can be processed — regulations that cloud solutions
structurally cannot satisfy without complex compliance frameworks.

Local inference eliminates the problem architecturally. A legal firm summarising client contracts
never transmits that data outside the machine. A hospital using AI-assisted diagnostics keeps patient
records on-premises. This isn't distrust of cloud providers — it's compliance requirements that local
inference satisfies by design.

## The OS Integration Layer

The transition is accelerating beyond individual applications. Microsoft's Copilot+ PC initiative
and Apple's Neural Engine are embedding on-device AI directly into operating system primitives:

- Semantic search across local files without indexing servers
- Real-time translation of video calls entirely on-device
- Live transcription of meetings stored only locally
- Intelligent photo organisation without cloud photo libraries

When AI capabilities become OS-level features rather than application-layer add-ons, adoption
becomes frictionless — users benefit without choosing to engage.

## Key Takeaways

The future of AI in personal computing is **distributed, private, and fast**. NPUs in consumer
processors represent a genuine architectural shift, not a marketing cycle. Developers and architects
building for this landscape should:

1. **Design for graceful degradation** — assume local inference for interactive tasks, cloud for
   computationally intensive or infrequent ones
2. **Evaluate quantised models first** — GGUF 4-bit variants are now first-class production options,
   not compromises
3. **Treat 50 ms as the interactive latency budget** — anything slower breaks the illusion of
   on-device responsiveness
4. **Architect for data residency from day one** — retrofitting local inference into a cloud-first
   design is expensive; building local-first is not

The revolution won't announce itself with a keynote. It will arrive quietly, one NPU-accelerated
inference at a time, until running AI locally feels as natural as running a spreadsheet.`;

const MOCK_CRITIQUE: CritiqueReport = {
  score: 88,
  feedback: [
    'Opening paragraph: lead with the latency comparison figure (20 ms vs 800 ms) before the metaphorical framing — it grounds the claim immediately.',
    '"What NPUs Actually Enable" section: pair each bullet with a specific product or app name so readers can act on the list rather than treating it as abstract.',
  ],
  requiresRevision: false,
};

export function createMockState(topic: string, id: string): BlogState {
  const now = new Date().toISOString();
  return {
    id,
    topic,
    researchData: MOCK_RESEARCH,
    draftMarkdown: MOCK_DRAFT,
    status: 'pending_approval',
    createdAt: now,
    updatedAt: now,
    critiqueReport: MOCK_CRITIQUE,
    critiqueHistory: [JSON.stringify(MOCK_CRITIQUE)],
    draftIteration: 1,
  };
}
