/**
 * plaidLink — load Plaid's Link SDK from their CDN on demand and open Link.
 * No npm dependency: Plaid's Link web SDK is a single script that exposes
 * `window.Plaid.create`. We load it once, then open with the server-minted
 * link_token. On success Plaid hands back a public_token → the caller exchanges it
 * server-side (the access token never touches the browser). (Roadmap §W2.3.)
 */
const PLAID_SDK_SRC = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

interface PlaidHandler { open: () => void; exit: () => void; destroy: () => void; }
interface PlaidGlobal {
  create: (opts: {
    token: string;
    onSuccess: (publicToken: string, metadata: unknown) => void;
    onExit: (err: unknown | null) => void;
  }) => PlaidHandler;
}
declare global {
  interface Window { Plaid?: PlaidGlobal; }
}

let loading: Promise<PlaidGlobal> | null = null;

function loadPlaid(): Promise<PlaidGlobal> {
  if (window.Plaid) return Promise.resolve(window.Plaid);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = PLAID_SDK_SRC;
    s.async = true;
    s.onload = () => (window.Plaid ? resolve(window.Plaid) : reject(new Error("plaid_sdk_unavailable")));
    s.onerror = () => reject(new Error("plaid_sdk_load_failed"));
    document.head.appendChild(s);
  });
  return loading;
}

/** Open Plaid Link with a link_token. Resolves with the public_token on success,
 *  or null if the user closed Link without connecting. */
export async function openPlaidLink(linkToken: string): Promise<string | null> {
  const plaid = await loadPlaid();
  return new Promise((resolve, reject) => {
    const handler = plaid.create({
      token: linkToken,
      onSuccess: (publicToken) => { resolve(publicToken); handler.destroy(); },
      onExit: (err) => {
        handler.destroy();
        if (err) reject(err instanceof Error ? err : new Error(String((err as { error_message?: string })?.error_message ?? "plaid_exit")));
        else resolve(null);   // user closed without connecting
      },
    });
    handler.open();
  });
}
