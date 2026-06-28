export interface Env {
  ANTHROPIC_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  SITE_CACHE: KVNamespace;
  ALLOWED_ORIGINS: string;
  ANTHROPIC_MODEL: string;
  SITE_URL: string;

  // Shared secret between the Python Discord bridge on Lightsail and this
  // Worker. Set via `wrangler secret put DISCORD_BRIDGE_SECRET`. Without it,
  // /discord/* endpoints return 401.
  DISCORD_BRIDGE_SECRET?: string;

  // Public URL the Worker is reachable at (e.g. https://bubble.founderfirst.one).
  // Used to build the /connect-discord magic link we send to users. Optional —
  // defaults to bubble.founderfirst.one to match the wrangler custom domain.
  BUBBLE_PUBLIC_URL?: string;

  // Workers AI binding — powers /compose (email "Draft with AI"), replacing the
  // local Ollama compose-server. Configured as [ai] in wrangler.toml.
  AI: Ai;

  // Shared secret between the email-compose Supabase fn and the /compose route.
  // Set via `wrangler secret put COMPOSE_SECRET`; must match the Supabase secret.
  COMPOSE_SECRET?: string;

  // Cloudflare AI Gateway (AI quality & cost layer, D11). Set BOTH to route every
  // AI call through the gateway (routing, fallback, spend caps, logs). Unset =
  // call providers directly, byte-identical to today. Configured as [vars] in
  // wrangler.toml; cache stays OFF in Phase 0 so answers never change/cross tenants.
  AI_GATEWAY_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
}

