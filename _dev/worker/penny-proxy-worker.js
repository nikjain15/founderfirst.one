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

// Simple in-memory rate limit: max 10 requests per IP per minute
const ipTimestamps = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const window = 60_000;
  const max = 10;
  const times = (ipTimestamps.get(ip) || []).filter(t => now - t < window);
  if (times.length >= max) return true;
  times.push(now);
  ipTimestamps.set(ip, times);
  return false;
}

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

    // Token check — only allow requests carrying the demo token
    const token = request.headers.get('X-Demo-Token');
    if (!env.DEMO_TOKEN || token !== env.DEMO_TOKEN) {
      return jsonError('Unauthorized', 401, corsHeaders);
    }

    // Per-IP rate limit
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (isRateLimited(ip)) {
      return jsonError('Too many requests — please wait a moment', 429, corsHeaders);
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
