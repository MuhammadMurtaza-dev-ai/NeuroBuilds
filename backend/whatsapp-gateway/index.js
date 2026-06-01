'use strict';

/**
 * NeuroBuilds WhatsApp OTP Gateway
 *
 * Headless WhatsApp Web microservice — delivers 6-digit OTPs via WhatsApp.
 * Uses LocalAuth so the session survives restarts without re-scanning.
 *
 * Start:
 *   cd backend/whatsapp-gateway
 *   npm install
 *   GATEWAY_SECRET=your-secret node index.js
 *
 * On first run a QR code will appear in the terminal. Scan it with WhatsApp:
 *   WhatsApp → Settings → Linked Devices → Link a Device
 *
 * Environment:
 *   GATEWAY_PORT    (default: 3001)
 *   GATEWAY_SECRET  Shared secret for Bearer auth. Unset = no auth (dev only).
 */

const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const PORT           = parseInt(process.env.GATEWAY_PORT ?? '3001', 10);
const GATEWAY_SECRET = process.env.GATEWAY_SECRET ?? '';

if (!GATEWAY_SECRET) {
  console.warn(
    '[WhatsApp Gateway] WARNING: GATEWAY_SECRET is not set. ' +
    'The /send-otp endpoint is unprotected. Set it in production.'
  );
}

// ── WhatsApp client ───────────────────────────────────────────────────────────

const wClient = new Client({
  authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
    ],
  },
});

let waReady  = false;
let waStatus = 'initialising';

wClient.on('qr', (qr) => {
  waStatus = 'awaiting_scan';
  console.log('\n[WhatsApp Gateway] ──────────────────────────────────────────────');
  console.log('[WhatsApp Gateway] Scan the QR code below with your WhatsApp app:');
  console.log('[WhatsApp Gateway]   WhatsApp → Settings → Linked Devices → Link a Device');
  console.log('[WhatsApp Gateway] ──────────────────────────────────────────────\n');
  qrcode.generate(qr, { small: true });
  console.log('\n[WhatsApp Gateway] Waiting for scan...\n');
});

wClient.on('authenticated', () => {
  waStatus = 'authenticated';
  console.log('[WhatsApp Gateway] Authenticated — restoring session...');
});

wClient.on('ready', () => {
  waReady  = true;
  waStatus = 'ready';
  console.log('[WhatsApp Gateway] Client ready. OTP delivery is operational.\n');
});

wClient.on('auth_failure', (msg) => {
  waReady  = false;
  waStatus = 'auth_failure';
  console.error('[WhatsApp Gateway] Authentication failure:', msg);
  console.error('[WhatsApp Gateway] Delete .wwebjs_auth/ and restart to re-scan the QR code.');
});

wClient.on('disconnected', (reason) => {
  waReady  = false;
  waStatus = 'disconnected';
  console.warn(`[WhatsApp Gateway] Disconnected (${reason}) — attempting reconnect...`);
  // Brief delay before reinitialisation to avoid tight reconnect loops
  setTimeout(() => {
    wClient.initialize().catch((err) => {
      console.error('[WhatsApp Gateway] Reconnection failed:', err.message);
      waStatus = 'reconnect_failed';
    });
  }, 5_000);
});

wClient.initialize().catch((err) => {
  console.error('[WhatsApp Gateway] Initialisation error:', err.message);
  waStatus = 'init_error';
});

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '4kb' }));

function checkSecret(req, res, next) {
  if (!GATEWAY_SECRET) return next();
  const authHeader = (req.headers['authorization'] ?? '').trim();
  if (authHeader !== `Bearer ${GATEWAY_SECRET}`) {
    console.warn(`[WhatsApp Gateway] Rejected unauthorised request from ${req.ip}`);
    return res.status(401).json({ error: 'Unauthorised' });
  }
  next();
}

/** Convert an E.164 phone string to a WhatsApp chat ID. */
function toChatId(phone) {
  return phone.replace(/^\+/, '').replace(/\s+/g, '') + '@c.us';
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    ready:   waReady,
    status:  waStatus,
    service: 'neurobuilds-whatsapp-gateway',
  });
});

app.post('/send-otp', checkSecret, async (req, res) => {
  const { phone, otp } = req.body ?? {};

  if (!phone || typeof phone !== 'string') {
    return res
      .status(400)
      .json({ error: '`phone` is required (E.164 format, e.g. +923001234567)' });
  }
  if (!otp || typeof otp !== 'string' || !/^\d{6}$/.test(otp)) {
    return res
      .status(400)
      .json({ error: '`otp` must be a 6-digit numeric string' });
  }

  if (!waReady) {
    console.error(
      `[WhatsApp Gateway] /send-otp called but client is not ready (status: ${waStatus})`
    );
    return res.status(503).json({
      error:  `WhatsApp client is not ready (status: ${waStatus}). ` +
              'Scan the QR code displayed in the terminal to activate the gateway.',
    });
  }

  const chatId  = toChatId(phone);
  const message =
    `🔐 *NeuroBuilds Seller Verification*\n\n` +
    `Your one-time verification code is:\n\n` +
    `*${otp}*\n\n` +
    `This code expires in 5 minutes.\n` +
    `Do not share it with anyone.\n\n` +
    `_If you did not request this, you can safely ignore this message._`;

  try {
    await wClient.sendMessage(chatId, message);
    console.log(`[WhatsApp Gateway] OTP delivered to ${chatId}`);
    return res.json({ success: true });
  } catch (err) {
    console.error(`[WhatsApp Gateway] Delivery failed for ${chatId}:`, err.message);
    return res.status(500).json({
      error: `Message delivery failed: ${err.message}`,
    });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[WhatsApp Gateway] HTTP server listening on http://127.0.0.1:${PORT}`);
  console.log('[WhatsApp Gateway] Initialising WhatsApp client — this may take a moment...\n');
});
