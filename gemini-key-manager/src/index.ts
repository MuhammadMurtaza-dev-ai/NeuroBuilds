/**
 * Test harness — demonstrates the KeyRotationManager + GeminiProxyService
 * under simulated high-concurrency traffic.
 *
 * Provide real keys via env vars for live API calls:
 *   GEMINI_KEY_1=AIza... GEMINI_KEY_2=AIza... npx ts-node src/index.ts
 *
 * Without real keys, the harness stubs the SDK and exercises the rotation,
 * throttle-eviction, and fallback logic using injected mock errors.
 */

import { KeyRotationManager } from './services/KeyRotationManager';
import { GeminiProxyService } from './services/GeminiProxyService';

// ── Key resolution ────────────────────────────────────────────────────────────

function resolveKeys(): string[] {
  const fromEnv: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const val = process.env[`GEMINI_KEY_${i}`];
    if (val) fromEnv.push(val.trim());
  }
  // Fall back to synthetic placeholder keys for dry-run / CI
  return fromEnv.length > 0
    ? fromEnv
    : ['MOCK_KEY_ALPHA', 'MOCK_KEY_BETA', 'MOCK_KEY_GAMMA'];
}

// ── Colour helpers (no deps) ──────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  grey: '\x1b[90m',
  magenta: '\x1b[35m',
};

function banner(text: string): void {
  const line = '═'.repeat(text.length + 4);
  console.log(`\n${C.cyan}╔${line}╗`);
  console.log(`║  ${C.bold}${text}${C.reset}${C.cyan}  ║`);
  console.log(`╚${line}╝${C.reset}\n`);
}

function section(title: string): void {
  console.log(`${C.magenta}▶ ${C.bold}${title}${C.reset}`);
}

// ── Result formatters ─────────────────────────────────────────────────────────

function printTextResult(reqId: number, result: Awaited<ReturnType<GeminiProxyService['generateText']>>): void {
  const retry = result.retryCount > 0 ? `${C.yellow} (${result.retryCount} retry)${C.reset}` : '';
  const excerpt = result.text.slice(0, 80).replace(/\n/g, ' ');
  console.log(
    `  ${C.green}✓${C.reset} req#${String(reqId).padStart(2, '0')} → ${C.cyan}${result.keyId}${C.reset}${retry}` +
    `  ${C.grey}[${result.durationMs}ms | ${result.tokensUsed} tok]${C.reset}`,
  );
  console.log(`     ${C.grey}"${excerpt}…"${C.reset}`);
}

function printEmbedResult(reqId: number, result: Awaited<ReturnType<GeminiProxyService['getEmbeddings']>>): void {
  const retry = result.retryCount > 0 ? `${C.yellow} (${result.retryCount} retry)${C.reset}` : '';
  console.log(
    `  ${C.green}✓${C.reset} req#${String(reqId).padStart(2, '0')} → ${C.cyan}${result.keyId}${C.reset}${retry}` +
    `  ${C.grey}[${result.durationMs}ms | ${result.values.length}-dim vector]${C.reset}`,
  );
}

function printError(reqId: number, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.log(`  ${C.red}✗${C.reset} req#${String(reqId).padStart(2, '0')} ${C.red}FAILED:${C.reset} ${msg}`);
}

// ── Stats table ───────────────────────────────────────────────────────────────

function printStats(manager: KeyRotationManager): void {
  console.log();
  section('Key Pool Final State');
  console.log(
    `  ${'ID'.padEnd(10)}${'STATUS'.padEnd(12)}${'WIN REQS'.padEnd(12)}${'WIN TOKS'.padEnd(12)}TOTAL OK`,
  );
  console.log('  ' + '─'.repeat(52));
  for (const s of manager.getStats()) {
    const status =
      s.status === 'healthy'
        ? `${C.green}healthy${C.reset}`
        : `${C.red}throttled${C.reset}`;
    const eta =
      s.throttledUntil !== null
        ? ` (${Math.max(0, Math.ceil((s.throttledUntil - Date.now()) / 1000))}s left)`
        : '';
    console.log(
      `  ${s.id.padEnd(10)}${(s.status + eta).padEnd(22)}${String(s.requestsInCurrentWindow).padEnd(12)}` +
      `${String(s.tokensInCurrentWindow).padEnd(12)}${s.totalSuccessfulCalls}`,
    );
  }
  console.log();
}

// ── Mock key throttle injector (dry-run only) ─────────────────────────────────

/**
 * When no real keys are present we manually throttle the first key before
 * the burst so the harness visibly demonstrates rotation and fallback.
 */
function injectDryRunThrottle(manager: KeyRotationManager): void {
  console.log(`${C.yellow}[dry-run] Throttling key_01 to force visible rotation${C.reset}`);
  // Access internals via casting — only acceptable in test code
  const rm = manager as unknown as { registry: Map<string, { status: string; throttledUntil: number }> };
  const first = Array.from(rm.registry.values())[0];
  if (first) {
    first.status = 'throttled';
    first.throttledUntil = Date.now() + 8_000; // 8-second block
  }
}

// ── Harness entry-point ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  banner('Gemini API Key Rotation & Load-Balancing Manager');

  const keys = resolveKeys();
  const isDryRun = keys[0].startsWith('MOCK_KEY_');

  KeyRotationManager.reset(); // ensure clean slate between runs
  const manager = KeyRotationManager.getInstance(keys);
  const proxy = new GeminiProxyService(manager);

  console.log(`${C.bold}Pool size:${C.reset} ${keys.length} keys`);
  console.log(`${C.bold}Mode:${C.reset}      ${isDryRun ? `${C.yellow}dry-run (mock keys)${C.reset}` : `${C.green}live (real keys)${C.reset}`}`);

  if (isDryRun) {
    injectDryRunThrottle(manager);
  }

  // ── Phase 1: sequential warm-up ────────────────────────────────────────────

  section('\nPhase 1 — Sequential warm-up (4 text requests)');

  const warmupPrompts = [
    'Name the top 3 AMD CPUs for gaming in 2025.',
    'What are the key differences between DDR4 and DDR5 RAM?',
    'Explain PCIe 5.0 lanes in 30 words.',
    'Recommend a 650W PSU for an RTX 4080 build.',
  ];

  for (let i = 0; i < warmupPrompts.length; i++) {
    try {
      const result = await proxy.generateText(warmupPrompts[i]);
      printTextResult(i + 1, result);
    } catch (err) {
      printError(i + 1, err);
    }
  }

  // ── Phase 2: concurrent burst ──────────────────────────────────────────────

  section('\nPhase 2 — Concurrent burst (12 parallel text requests)');

  const burstPrompts = Array.from({ length: 12 }, (_, i) =>
    `Hardware query #${i + 1}: What is a good component choice for a $${400 + i * 50} PC build?`,
  );

  const burstTasks = burstPrompts.map((p, i) =>
    proxy
      .generateText(p)
      .then((r) => ({ ok: true as const, reqId: i + 1, result: r }))
      .catch((err) => ({ ok: false as const, reqId: i + 1, err })),
  );

  const burstResults = await Promise.all(burstTasks);
  for (const r of burstResults) {
    if (r.ok) {
      printTextResult(r.reqId, r.result);
    } else {
      printError(r.reqId, r.err);
    }
  }

  // ── Phase 3: embedding burst ───────────────────────────────────────────────

  section('\nPhase 3 — Concurrent embedding burst (8 parallel embed requests)');

  const embedTexts = [
    'RTX 4090 gaming GPU flagship',
    'Intel Core i9-14900K overclock',
    'DDR5 6000MHz CL30 memory kit',
    'Samsung 990 Pro NVMe SSD',
    'Noctua NH-D15 CPU cooler',
    'ASUS ROG Maximus Z790 motherboard',
    'Corsair HX1000i 80+ Platinum PSU',
    'Fractal Design Torrent ATX case',
  ];

  const embedTasks = embedTexts.map((t, i) =>
    proxy
      .getEmbeddings(t)
      .then((r) => ({ ok: true as const, reqId: i + 1, result: r }))
      .catch((err) => ({ ok: false as const, reqId: i + 1, err })),
  );

  const embedResults = await Promise.all(embedTasks);
  for (const r of embedResults) {
    if (r.ok) {
      printEmbedResult(r.reqId, r.result);
    } else {
      printError(r.reqId, r.err);
    }
  }

  // ── Phase 4: throttle recovery demonstration ───────────────────────────────

  if (isDryRun) {
    section('\nPhase 4 — Throttle recovery check (key_01 should still be blocked)');
    printStats(manager);
    console.log(`${C.grey}Wait 8s for key_01 throttle to expire, then re-run to see it recover.${C.reset}`);
  }

  // ── Final stats ────────────────────────────────────────────────────────────

  section('Phase 5 — Final pool statistics');
  printStats(manager);

  const succeeded = [...burstResults, ...embedResults].filter((r) => r.ok).length;
  const failed = [...burstResults, ...embedResults].filter((r) => !r.ok).length;

  console.log(`${C.bold}Summary:${C.reset}`);
  console.log(`  ${C.green}Succeeded${C.reset}: ${succeeded}`);
  if (failed > 0) console.log(`  ${C.red}Failed   ${C.reset}: ${failed}`);
  console.log();
}

main().catch((err) => {
  console.error(`${C.red}Fatal:${C.reset}`, err);
  process.exit(1);
});
