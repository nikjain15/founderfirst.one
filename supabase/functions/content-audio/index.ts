import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/**
 * content-audio — Step 6 of the content pipeline. Renders the draft's audio
 * script into a single branded-voice MP3 and stores it on the item.
 *
 * Provider strategy (locked decision): open-best as primary, paid as fallback.
 *   1. PRIMARY  — Chatterbox (MIT) on the Fly GPU TTS server (scale-to-zero).
 *                 It runs Podcastfy assembly + voice-cloning from the brand
 *                 reference clip, and returns one finished MP3.
 *   2. FALLBACK — ElevenLabs API, single-voice read of the flattened script.
 * Both clone the SAME locked reference clip (content_voice_profile), so the
 * brand voice is identical either way. Audio is blocked until that clip exists.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });

type Line = { speaker: string; text: string };

async function viaChatterbox(script: Line[], voiceRefUrl: string): Promise<Uint8Array> {
  const server = Deno.env.get("TTS_SERVER_URL"); // e.g. https://founderfirst-tts.fly.dev/synthesize
  if (!server) throw new Error("no_tts_server");
  const res = await fetch(server, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(Deno.env.get("TTS_SERVER_SECRET") ? { "x-tts-secret": Deno.env.get("TTS_SERVER_SECRET")! } : {}) },
    body: JSON.stringify({ script, voice_ref_url: voiceRefUrl, format: "mp3" }),
  });
  if (!res.ok) throw new Error(`chatterbox ${res.status}: ${await res.text().catch(() => "")}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function viaElevenLabs(script: Line[]): Promise<Uint8Array> {
  const key = Deno.env.get("ELEVENLABS_API_KEY");
  const voiceId = Deno.env.get("ELEVENLABS_VOICE_ID"); // brand voice cloned from the same reference clip
  if (!key || !voiceId) throw new Error("no_elevenlabs_config");
  const text = script.map((l) => l.text).join("\n\n");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
  });
  if (!res.ok) throw new Error(`elevenlabs ${res.status}: ${await res.text().catch(() => "")}`);
  return new Uint8Array(await res.arrayBuffer());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });

    const { data: u, error: uErr } = await userClient.auth.getUser();
    if (uErr || !u.user?.email) return json({ error: "unauthenticated" }, 401);
    const { data: isAdmin, error: aErr } = await userClient.rpc("is_admin");
    if (aErr || !isAdmin) return json({ error: "admin only" }, 403);

    const { item_id } = await req.json().catch(() => ({}));
    if (!item_id) return json({ error: "item_id required" }, 400);

    const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

    const { data: item, error: iErr } = await service
      .from("content_pipeline").select("id, script").eq("id", item_id).single();
    if (iErr || !item) return json({ error: "item not found" }, 404);

    const script = ((item.script ?? {}) as { audio?: Line[] }).audio ?? [];
    if (!script.length) return json({ error: "no_script — run content-draft first" }, 400);

    // Brand voice must exist (locked reference clip) before any audio can render.
    const { data: voice } = await service.rpc("get_active_voice_profile");
    const refUrl = (voice as { reference_clip_url?: string } | null)?.reference_clip_url ?? "";
    if (!refUrl) return json({ error: "no_voice_clip — add a reference clip to the brand voice profile first" }, 409);

    let bytes: Uint8Array;
    let provider: string;
    try {
      bytes = await viaChatterbox(script, refUrl);
      provider = "chatterbox";
    } catch (primaryErr) {
      try {
        bytes = await viaElevenLabs(script);
        provider = "elevenlabs";
      } catch (fallbackErr) {
        return json({
          error: "tts_failed",
          primary: primaryErr instanceof Error ? primaryErr.message : String(primaryErr),
          fallback: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
        }, 502);
      }
    }

    const path = `${item_id}/${Date.now()}.mp3`;
    const { error: upErr } = await service.storage.from("content-audio").upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
    if (upErr) return json({ error: `upload: ${upErr.message}` }, 500);
    const { data: pub } = service.storage.from("content-audio").getPublicUrl(path);

    const { error: wErr } = await service.from("content_pipeline").update({ audio_url: pub.publicUrl }).eq("id", item_id);
    if (wErr) return json({ error: wErr.message }, 500);

    return json({ ok: true, item_id, provider, audio_url: pub.publicUrl });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
