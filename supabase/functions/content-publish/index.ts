import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/**
 * content-publish — Step 8 of the content pipeline. Turns an approved item into a
 * live blog post and (best-effort) schedules a promo email, then marks the item
 * 'published' with a link back.
 *
 * Blog: build the BlogPost payload from seo + the markdown draft (converted to
 * the body-block vocabulary the Astro blog renders), then create_blog_post_version
 * + set_live_blog_post. Those RPCs check is_admin() via auth.uid(), so they're
 * called with the USER's JWT (not the service role).
 *
 * Promo: if a 'content_promo' email template exists, insert a one-off
 * email_schedules row pointing at the new post. If not, we skip it (no FK break)
 * and report that — publishing must never fail because the promo isn't set up.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });

const SITE_URL = "https://founderfirst.one";

/** Convert markdown to the blog body-block vocabulary ({h}, {p}). Minimal but lossless for headings + prose. */
function mdToBlocks(md: string): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  const paras = md.replace(/\r\n/g, "\n").split(/\n{2,}/);
  for (const raw of paras) {
    const block = raw.trim();
    if (!block) continue;
    const h = block.match(/^#{1,3}\s+(.*)$/);
    if (h) blocks.push({ h: h[1].trim() });
    else blocks.push({ p: block.replace(/\n/g, " ") });
  }
  return blocks;
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
      .from("content_pipeline").select("id, topic, draft_md, audio_url, audio_seconds, audio_bytes, seo").eq("id", item_id).single();
    if (iErr || !item) return json({ error: "item not found" }, 404);
    if (!item.draft_md) return json({ error: "no draft — run content-draft first" }, 400);

    const seo = (item.seo ?? {}) as { slug?: string; title?: string; description?: string; tag?: string; read_mins?: number; takeaways?: string[] };
    const slug = (seo.slug || item.topic).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

    const body = mdToBlocks(String(item.draft_md));
    // Branded player block at the top; carries duration + size for the podcast feed.
    if (item.audio_url) body.unshift({ audio: item.audio_url, seconds: item.audio_seconds ?? null, bytes: item.audio_bytes ?? null });

    const payload = {
      slug,
      title: seo.title || item.topic,
      description: seo.description || "",
      date: new Date().toISOString().slice(0, 10),
      readMins: seo.read_mins || 4,
      tag: seo.tag || "Guides",
      takeaways: seo.takeaways ?? [],
      body,
    };

    // Create + publish the blog version AS THE USER (RPCs gate on is_admin()/auth.uid()).
    const { data: versionId, error: cErr } = await userClient.rpc("create_blog_post_version", {
      p_slug: slug, p_payload: payload, p_notes: `From content pipeline ${item_id}`,
    });
    if (cErr) return json({ error: `create_blog_post_version: ${cErr.message}` }, 500);
    const { error: lErr } = await userClient.rpc("set_live_blog_post", { p_id: versionId });
    if (lErr) return json({ error: `set_live_blog_post: ${lErr.message}` }, 500);

    const blogPath = `/blog/${slug}`;

    // Best-effort promo schedule (skip cleanly if the template isn't set up).
    let promo: { scheduled: boolean; reason?: string; id?: string } = { scheduled: false };
    const { data: tmpl } = await service.from("email_templates").select("email_key").eq("email_key", "content_promo").maybeSingle();
    if (tmpl?.email_key) {
      const { data: sched, error: sErr } = await service.from("email_schedules").insert({
        email_key: "content_promo",
        frequency: "once",
        run_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // ~1h out, gives a review window
        audience_kind: "list",
        cta_href: `${SITE_URL}${blogPath}`,
        enabled: true,
        is_builtin: false,
        kind: "schedule",
        dispatch: "generic",
        created_by: u.user.email,
      }).select("id").single();
      promo = sErr ? { scheduled: false, reason: sErr.message } : { scheduled: true, id: sched?.id };
    } else {
      promo = { scheduled: false, reason: "no content_promo template" };
    }

    const { error: wErr } = await service.from("content_pipeline")
      .update({ status: "published", published_ref: blogPath, promo_schedule_id: promo.id ?? null }).eq("id", item_id);
    if (wErr) return json({ error: wErr.message }, 500);

    return json({ ok: true, item_id, blog_path: blogPath, version_id: versionId, promo });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
