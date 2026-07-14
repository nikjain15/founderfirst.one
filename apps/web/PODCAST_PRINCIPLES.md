# Penny by FounderFirst — Podcast Playbook

The reusable spec for producing an episode of **Penny by FounderFirst**. Follow this and every episode looks, sounds, and reads the same. Read [VOICE.md](../../VOICE.md) (words) and [BLOG_PRINCIPLES.md](BLOG_PRINCIPLES.md) (the post shape) first — this file adds the podcast-specific layer on top.

> **The one-line test.** Would a calm, knowledgeable friend put this in your ears on a commute? Warm, human, educational — never a pitch.

---

## The show

- **Name:** *Penny by FounderFirst.* A warm, smart show about running a business without the back-office grind — money, books, clean numbers, in plain English.
- **Format:** two hosts, real conversation. ~8–9 minutes. Educational-first.
- **Host 1 — Penny:** our brand voice. The calm, knowledgeable one who explains and gently teaches.
- **Host 2 — the guest:** a real-feeling business owner the audience relates to. A different first name each episode; **honest, light persona — no fabricated credentials.**
- **Reference feel:** *Criminal* (Phoebe Judge) — calm, warm, intimate, measured. Not fast, not hyped.

---

## 1. Voice & script

Inherits every rule in [VOICE.md](../../VOICE.md). Podcast-specific rules:

**Persona — pull the guest from Signals.**
- Query the Signals pipeline (`sig_scores.intent`, `sig_items`) for the **highest-intent** owners. Prefer the **$5–10MM complexity band** (multi-channel, inventory, payroll, multi-state) so the story has real stakes.
- Build the guest as a **representative composite** of that segment — never impersonate a named person or expose a handle.
- Ground their pain in what the posts actually say (the late-night YouTube, the several CPAs, the bookkeepers, "I don't know if my numbers are real").

**The guest never sells Penny.** Only Penny may make the offer, and only softly, once. Quote the offer verbatim: **"three months on us."** The guest's job is the human story, not the pitch.

**Never put CPAs or bookkeepers in a bad light** — they're future users. The villain is always the *model* (backward-looking, stitched-together), never the people.

**Structure (segmented, clear turns):**
1. **Cold open** — a 2–3 line hook: a real founder moment (e.g., the 2 a.m. "I had the revenue, not the truth").
2. **Who we are** — "This is Penny by FounderFirst…" Introduce show + both hosts + us (FounderFirst builds operating software; Penny is the first product, an autonomous bookkeeper).
3. **The journey** — warm, curious questions draw out how hard the guest *tried* (self-teaching, experts) and why it still didn't work.
4. **The lessons** — the teachable core (e.g., bank balance ≠ profit; catch-up bookkeeping breaks at scale; clean books are the floor for every decision; due-diligence stakes).
5. **Where Penny fits** — light, honest, grounded facts only. Read-only framed as an old bookkeeping principle.
6. **Outro** — where to find us, the soft offer (Penny only), warm sign-off, tease more episodes.

**Dialogue craft (what makes it human, not robotic):**
- **No word-for-word echo.** A host must not repeat the other's exact words back. React sideways, in your own phrasing.
- Varied openings, natural fillers and pauses ("Yeah…", "Right,", "Honestly,", "Huh."), the occasional tangent.
- Questions are warm and validating, never make the guest feel dumb ("what did you do when you felt it slipping — I know you didn't just give up").
- Length ~1,000–1,300 words ≈ 8–9 minutes.

**Grounded facts only** (never invent numbers/features/dates): autonomous & continuous; connects to accounts you already use; categorizes the way your accountant needs, you confirm with a tap; **read-only — can see & organize, never move money**; history import; one source → owner cockpit + CPA double-entry ledger. Offer verbatim: **"three months on us."** Contact: `founder@founderfirst.one` · site: `founderfirst.one`.

**Spoken-form conversions for TTS** (in the audio script only, not the show notes):
- `founderfirst.one` → "founderfirst dot one"
- `founder@founderfirst.one` → "founder at founderfirst dot one"
- `P&L` → "P and L"; smooth em-dashes to commas/periods.

---

## 2. Audio production — ElevenLabs v3

We render on **ElevenLabs v3** (the expressive model), via **Text-to-Dialogue** (one-pass conversation). This was chosen after A/B'ing the open models (Kokoro/Dia/F5/Orpheus/XTTS/StyleTTS2/Higgs) and F5 vs ElevenLabs — v3 wins on warmth + human emotion, and holds a consistent voice, which open dialogue models (Dia) do not.

> **The lesson that cost us a robotic first cut:** rendering line-by-line and stitching the clips (with a `ffmpeg atempo` slowdown on top) sounds robotic — every line is generated with zero context of the line before it, so there's no reaction, no conversational timing. Friends called it out immediately. **The fix is Text-to-Dialogue** (below): the model hears the whole exchange at once. Do not go back to line-by-line stitching or time-stretching.

**Locked voices & settings:**
| | Voice | Notes |
|---|---|---|
| **Penny** | `Matilda` | American, "Knowledgable, Professional" — composed, not breathy |
| **Guest** | `George` | "Warm, Captivating Storyteller" |

- **Render method — Text-to-Dialogue, one pass per section (this is the whole game).** `POST /v1/text-to-dialogue` with an `inputs[]` array of `{text, voice_id}` (Penny → Matilda, guest → George), so the model gets the **whole exchange** and gives it real timing + reactions. **Never** render line-by-line and stitch.
- **Model:** `eleven_v3` · **settings:** `stability: 0.32`, `use_speaker_boost: true`.
- **NO time-stretch.** Do not `atempo`/slow the audio — it adds a synthetic warble. Pace comes from the model + punctuation.
- **Delivery cues — distribute across BOTH hosts, especially Penny.** Matilda is more even than George, so direct her: `[warmly]` on openers, `[curious]` on questions, `[gently]`/`[reassuring]` when she validates, `[thoughtfully]` on teaching beats; sparing `[sighs]`/`[chuckles softly]` inline. Avoid breathy `[softly]`/`[whispers]` (read flirty).
- **Chunking:** Text-to-Dialogue caps request length, so split a full episode into ~10–14-turn chunks **at section boundaries** (between exchanges, never mid-Q&A), render each as one dialogue call, concat with ~**0.4s** gaps. ~7k characters ≈ **~$0.70/episode**.
- **Key:** `ELEVEN_KEY` in `~/.config/founderfirst/secrets.env` (unrestricted key; API needs a payment method). Working harness: `scratchpad/abtest/ab_el_dialogue_full.py` (reads the finalized `LINES`, applies cues, renders in dialogue chunks).

> **Pipeline note:** ElevenLabs is not yet wired into the `content-audio` edge function (that still uses Kokoro on Fly CPU). Episodes are currently rendered with the scratchpad harness, then attached at publish time. Wiring EL in as the default engine is the clean next step.

---

## 3. Website & design

An episode **is a published blog post tagged `Podcast`.** The post template ([apps/web/src/pages/blog/[slug].astro](src/pages/blog/[slug].astro)) branches on that tag:

- **Hero = the player, not a product visual.** `PennyPodcast.astro` renders a branded "now playing" card: round Penny mark + "Podcast · Penny by FounderFirst" + a **real waveform** + **click-to-play** (► toggles play/pause, the waveform fills as progress and is clickable to seek, the label becomes a live `0:12 / 8:38` counter). Never the `PennyGlance` transactions demo.
- **Decluttered hero:** eyebrow reads "N min **listen**" (not "read"), then title, then the player. The description does **not** sit in the hero.
- **Order:** Key Takeaways card → **episode summary** (the description, moved here) → show notes body.
- **Back link:** "← All episodes" → `/podcast/` (not "All articles" → `/blog/`).
- **Key Takeaways:** the focal element — `--fs-body`, ✓ tight against the text (flex, `align-items:baseline`, zeroed `<ul>` padding), ~2 lines each.
- **Show notes (draft_md):** educational only. **No "Try Penny" promo section.** No "Episode N of Penny by FounderFirst." prefix in the description.
- **Brand mark:** round green badge, italic-serif **P** (matches the Penny chat avatar) — used on the `/podcast` hero and the episode hero.
- **Design tokens only** — no magic px, hex, or one-off font sizes ([tokens.css](../../packages/design-system/tokens.css)).

Surfaces: `/podcast` (index + hero, [podcast/index.astro](src/pages/podcast/index.astro)), `/podcast/rss.xml` (Apple/Spotify feed), and the episode post `/blog/<slug>`.

---

## 4. Publishing — end to end

1. **Write the script**, run it through §1, and get it approved before rendering.
2. **Render audio** (§2) → an `episode.mp3`.
3. **Upload** to Supabase storage: `PUT /storage/v1/object/content-audio/<slug>/episode.mp3` (service role) → public URL.
4. **Create a `content_pipeline` item** (service role): `source:'manual'`, `topic`, `draft_md` (show notes), `seo:{ slug, title, tag:'Podcast', read_mins, description, takeaways[] }`, and set `audio_url`, `audio_seconds`, `audio_bytes` directly.
5. **Mint an admin JWT** for a **super/editor admin** (e.g. `<super-admin-email>` — see `admins`/`admin_roles`): service-role `generate_link` → `verify` (magiclink) → `access_token`. (Mutating blog RPCs gate on `is_admin_editor()` — a non-admin like `tester@` is rejected.)
6. **`content-publish`** with `{item_id}` + the admin JWT → builds the post (audio block + `mdToBlocks`), sets it live, fires a rebuild.
7. **Replace the previous episode** if needed: `PATCH blog_posts?slug=eq.<old>&is_live=eq.true {is_live:false}` (service role). `/podcast` lists live posts that have an audio block.
8. **Deploy** any template/CSS changes: commit + push to `main` → `pages.yml` rebuilds GitHub Pages. Content-only changes deploy via the `content-publish` rebuild webhook.
9. **Verify live** — episode on `/podcast`, player plays, duration shows, hero + back link + notes correct.

---

## New-episode checklist

- [ ] Guest persona pulled from a real high-intent Signals cluster ($5–10MM complexity); composite, not a named person.
- [ ] Guest never sells; Penny makes the soft offer once ("three months on us").
- [ ] CPAs/bookkeepers never blamed.
- [ ] No echo, warm questions, natural pauses; ~8–9 min.
- [ ] Rules pass: no exclamation marks, no competitors, no tech/model names, American English, grounded facts only.
- [ ] Rendered on ElevenLabs v3 **Text-to-Dialogue** (one pass per section) — Matilda + George, `stability 0.32`, **no time-stretch**, warm cues on both hosts.
- [ ] Spoken-form addresses in the audio script.
- [ ] Post tagged `Podcast`; hero player; summary below takeaways; "← All episodes"; no Try-Penny promo; no "Episode N" prefix.
- [ ] Published, old episode retired if replacing, verified live.
