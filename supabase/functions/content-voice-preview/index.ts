import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/**
 * content-voice-preview — renders a short sample with the voice settings the
 * admin is currently editing (passed in the body, NOT read from the DB) so the
 * Voice Studio "Preview" button reflects unsaved slider positions. Calls the
 * Kokoro service, uploads to the public content-audio bucket, returns the URL.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

const SAMPLE = "Okay, picture this. Penny quietly does your books for you, all day, every day — and you get your evenings back.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user?.email) return json({ error: "unauthenticated" }, 401);
    const { data: isAdmin } = await userClient.rpc("is_admin");
    if (!isAdmin) return json({ error: "admin only" }, 403);

    const b = await req.json().catch(() => ({}));
    const server = Deno.env.get("KOKORO_SERVER_URL");
    if (!server) return json({ error: "no_kokoro_server" }, 500);

    const res = await fetch(server, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(Deno.env.get("KOKORO_SERVER_SECRET") ? { "x-kokoro-secret": Deno.env.get("KOKORO_SERVER_SECRET")! } : {}) },
      body: JSON.stringify({
        text: b.text || SAMPLE,
        voice_a: b.voice_a ?? "af_heart", voice_b: b.voice_b ?? "af_nova", blend: b.blend ?? 0.6,
        speed: b.speed ?? 0.88, gap_ms: b.gap_ms ?? 260, lang: b.lang ?? "a", bitrate: b.bitrate ?? "160k",
      }),
    });
    if (!res.ok) return json({ error: `kokoro ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}` }, 502);
    const bytes = new Uint8Array(await res.arrayBuffer());

    const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const path = `previews/${u.user.id}.mp3`; // one preview per admin, overwritten
    const { error: upErr } = await service.storage.from("content-audio").upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
    if (upErr) return json({ error: `upload: ${upErr.message}` }, 500);
    const { data: pub } = service.storage.from("content-audio").getPublicUrl(path);
    // cache-bust so the player always fetches the fresh render
    return json({ ok: true, audio_url: `${pub.publicUrl}?v=${bytes.length}` });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
