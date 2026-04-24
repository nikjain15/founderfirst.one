export interface Env {
  ANTHROPIC_KEY: string;
  DEMO_TOKEN: string;
}

const ALLOWED_ORIGINS = [
  "https://founderfirst.one",
  "https://www.founderfirst.one",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const ALLOWED_MODELS = new Set([
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
  "claude-opus-4-7",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Demo-Token",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname !== "/v1/messages" || request.method !== "POST") {
      return json({ error: "Not found" }, 404, origin);
    }

    const token = request.headers.get("X-Demo-Token");
    if (!token || token !== env.DEMO_TOKEN) {
      return json({ error: "Invalid demo token" }, 401, origin);
    }

    let body: {
      model?: string;
      max_tokens?: number;
      system?: string;
      messages?: Array<{ role: string; content: string }>;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400, origin);
    }

    const model = body.model || "claude-haiku-4-5-20251001";
    if (!ALLOWED_MODELS.has(model)) {
      return json({ error: `Model not allowed: ${model}` }, 400, origin);
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return json({ error: "messages[] is required" }, 400, origin);
    }

    // Support both plain string and structured system prompt from client.
    // When the client sends an array (with cache_control blocks), forward as-is.
    // When it sends a string, wrap it with cache_control so Anthropic caches it.
    const systemPayload = Array.isArray(body.system)
      ? body.system
      : [{ type: "text", text: body.system || "", cache_control: { type: "ephemeral" } }];

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify({
        model,
        max_tokens: Math.min(body.max_tokens || 400, 1024),
        system: systemPayload,
        messages: body.messages,
      }),
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "application/json",
        ...corsHeaders(origin),
      },
    });
  },
};
