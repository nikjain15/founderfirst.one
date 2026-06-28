-- =============================================================================
-- FounderFirst — Phase 2 blog seed: "Is AI bookkeeping safe?"
-- =============================================================================
--
-- Adds one buyer-intent / GEO post to the blog_posts table (model defined in
-- 20260627121000_blog_posts.sql). Mirrors the seed guard from that migration:
-- insert + set live ONLY if the slug does not yet exist, so re-running is a
-- no-op and an admin edit in /admin is never clobbered.
--
-- Payload is kept verbatim in sync with apps/web/src/blog/posts.ts (the seed /
-- fallback source of truth). One concept = one source of truth (LEARNINGS #6):
-- if you edit the post, edit it in both places, or edit it live in /admin.
--
-- NOTE: review before `supabase db push` (LEARNINGS.md rule 3). Prefer applying
-- this one statement via the dashboard SQL editor.
-- =============================================================================
do $seed$
declare v_slug text := 'is-ai-bookkeeping-safe';
begin
  if not exists (select 1 from blog_posts where slug = v_slug) then
    insert into blog_posts (slug, payload, notes, is_live)
    values (
      v_slug,
      $json${
        "slug": "is-ai-bookkeeping-safe",
        "title": "Is AI bookkeeping safe?",
        "description": "Yes — when it's built right. A safe AI bookkeeper has read-only access, can never move your money, encrypts your data end to end, and stays yours to export or delete anytime.",
        "date": "2026-06-28",
        "readMins": 5,
        "tag": "Guides",
        "takeaways": [
          "Yes — a well-built AI bookkeeper is safe. What matters is how it connects to your accounts.",
          "Read-only by design: it can see and sort your transactions but can never move a cent.",
          "Your data is encrypted in transit and at rest — the same rails your bank uses.",
          "Your books stay yours — exportable or deletable anytime, with no lock-in."
        ],
        "body": [
          { "p": "Handing your finances to software is a fair thing to be careful about. The honest answer: yes, AI bookkeeping is safe — when it's built the right way. What makes it safe isn't the AI itself. It's how the software connects to your accounts, what it's allowed to do, and how it treats your data." },
          { "stats": [
            { "value": "Read-only", "label": "it can sort, never move money" },
            { "value": "Encrypted", "label": "in transit and at rest" },
            { "value": "Yours", "label": "export or delete anytime" }
          ] },
          { "h": "Read-only access — it can't touch your money" },
          { "p": "A safe AI bookkeeper connects to Stripe, your bank, and your cards with read-only access. It can see and categorize every transaction, but it can never send a payment, move funds, or change a balance. The permission to move money is one it's never given. Penny works this way by design — it watches and sorts, and your money stays entirely in your hands." },
          { "visual": "readonly" },
          { "h": "Your data is encrypted — and it stays yours" },
          { "p": "Your financial data is encrypted in transit and at rest, on the same security rails your bank uses. And it stays yours: you can export your books or delete them whenever you want. No lock-in, no holding your records hostage. Safe bookkeeping means you can always walk away with everything." },
          { "h": "Can an AI bookkeeper get things wrong?" },
          { "p": "It can — any system can. The difference is what happens next. A good autonomous bookkeeper shows its work: every transaction it categorizes is there for you to see, and a few times a week it asks a one-tap question when it's unsure — \"business or personal?\" You stay in the loop on the judgment calls while the repetitive sorting runs itself. Nothing is hidden, and nothing is final without you." },
          { "quote": "Safe doesn't mean hands-off. It means you can see everything — and nothing can touch your money." },
          { "h": "What to check before you trust any AI bookkeeper" },
          { "p": "Three questions tell you most of what you need to know. Does it connect with read-only access, or can it move money? Is your data encrypted, and can you export or delete it anytime? And can you see how every transaction was categorized? When the answer to all three is yes, your books are in safe hands." },
          { "callout": { "title": "The short version", "text": "AI bookkeeping is safe when the software has read-only access, can never move your money, encrypts your data end to end, and lets you take your records with you. That's how Penny is built — it watches and sorts, but your money never leaves your control." } }
        ]
      }$json$::jsonb,
      'Phase 2 seed from posts.ts — is-ai-bookkeeping-safe',
      true
    );
  end if;
end;
$seed$;
