const ALLOWED_ORIGINS = [
  'https://founderfirst.one',
  'https://www.founderfirst.one',
];

const CORS_HEADERS = (origin) => ({
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Demo-Token',
  'Vary': 'Origin',
});

// In-memory rate limits: per-minute and per-day per IP
const ipTimestamps = new Map();
const MAX_PER_MIN = 6;
const MAX_PER_DAY = 200;
const MINUTE = 60_000;
const DAY = 24 * 60 * 60 * 1000;
function isRateLimited(ip) {
  const now = Date.now();
  const times = (ipTimestamps.get(ip) || []).filter(t => now - t < DAY);
  const inMinute = times.filter(t => now - t < MINUTE).length;
  if (inMinute >= MAX_PER_MIN) return true;
  if (times.length >= MAX_PER_DAY) return true;
  times.push(now);
  ipTimestamps.set(ip, times);
  return false;
}

const MAX_BODY_BYTES = 32 * 1024;
const MAX_MESSAGES = 40;

function jsonError(msg, status, corsHeaders) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const corsHeaders = CORS_HEADERS(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return jsonError('Method not allowed', 405, corsHeaders);
    }

    // Enforce origin allowlist server-side (CORS alone only protects browsers).
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return jsonError('Forbidden origin', 403, corsHeaders);
    }

    // Token check — only enforce when DEMO_TOKEN env var is configured
    const token = request.headers.get('X-Demo-Token');
    if (env.DEMO_TOKEN && token !== env.DEMO_TOKEN) {
      return jsonError('Unauthorized', 401, corsHeaders);
    }

    // Per-IP rate limit
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (isRateLimited(ip)) {
      return jsonError('Too many requests — please wait a moment', 429, corsHeaders);
    }

    // Reject oversized bodies before parsing
    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return jsonError('Payload too large', 413, corsHeaders);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError('Invalid JSON', 400, corsHeaders);
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return jsonError('messages must be a non-empty array', 400, corsHeaders);
    }
    if (body.messages.length > MAX_MESSAGES) {
      return jsonError('Too many messages', 400, corsHeaders);
    }

    // Only pass messages — never let callers override model/tokens/system
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: body.messages,
      }),
    });

    const data = await resp.json();

    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  },
};
