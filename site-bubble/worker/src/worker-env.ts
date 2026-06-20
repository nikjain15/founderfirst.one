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
}

