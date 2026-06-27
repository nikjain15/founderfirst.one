-- =============================================================================
-- FounderFirst — blog posts content model (admin-editable)
-- =============================================================================
--
-- Moves blog posts out of hardcoded apps/web/src/blog/posts.ts into a versioned,
-- admin-editable table — same pattern as content_pages: one versioned JSONB
-- document per slug, one-live partial index, RLS locked to security-definer RPCs
-- gated by is_admin(), audited via log_admin_action. Astro reads the live posts
-- at build via anon RPCs (with the code seed as fallback).
--
-- The seed reproduces today's single post verbatim, so cutover is a no-op until
-- an admin edits something.
--
-- NOTE: review before `supabase db push` (LEARNINGS.md rule 3).
-- =============================================================================

create table if not exists blog_posts (
  id          uuid        primary key default gen_random_uuid(),
  slug        text        not null,
  version     int         not null,
  payload     jsonb       not null,                       -- full BlogPost { title, body[], … }
  notes       text,
  is_live     boolean     not null default false,
  created_at  timestamptz not null default now(),
  created_by  uuid        references auth.users(id) on delete set null
);
create unique index if not exists blog_posts_one_live on blog_posts (slug) where is_live = true;
create index if not exists blog_posts_slug_idx on blog_posts (slug);

create or replace function blog_posts_set_version()
returns trigger language plpgsql as $$
begin
  if new.version is null then
    select coalesce(max(version), 0) + 1 into new.version from blog_posts where slug = new.slug;
  end if;
  return new;
end;
$$;
drop trigger if exists blog_posts_version_trg on blog_posts;
create trigger blog_posts_version_trg
  before insert on blog_posts for each row execute function blog_posts_set_version();

alter table blog_posts enable row level security;
drop policy if exists blog_posts_no_direct on blog_posts;
create policy blog_posts_no_direct on blog_posts for all using (false) with check (false);

-- =============================================================================
-- RPCs
-- =============================================================================

-- Public: all live posts, newest first (by payload date). Used by Astro /blog.
create or replace function list_live_blog_posts()
returns table (payload jsonb, updated_at timestamptz)
language sql security definer set search_path = public as $$
  select payload, created_at
  from blog_posts
  where is_live = true
  order by (payload->>'date') desc nulls last;
$$;
grant execute on function list_live_blog_posts() to anon, authenticated;

-- Public: the live post for a slug. Used by Astro /blog/[slug].
create or replace function get_live_blog_post(p_slug text)
returns table (payload jsonb, updated_at timestamptz)
language sql security definer set search_path = public as $$
  select payload, created_at
  from blog_posts
  where slug = p_slug and is_live = true
  limit 1;
$$;
grant execute on function get_live_blog_post(text) to anon, authenticated;

-- Admin: one row per slug (editor index).
create or replace function list_blog_posts()
returns table (slug text, title text, date text, version int, is_live boolean, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'list_blog_posts: admin access required'; end if;
  return query
    select distinct on (p.slug)
      p.slug, (p.payload->>'title'), (p.payload->>'date'), p.version, p.is_live, p.created_at
    from blog_posts p
    order by p.slug, p.is_live desc, p.version desc;
end;
$$;
grant execute on function list_blog_posts() to authenticated;

-- Admin: version history for a slug, newest first.
create or replace function list_blog_post_versions(p_slug text)
returns table (id uuid, version int, payload jsonb, notes text, is_live boolean,
               created_at timestamptz, created_by uuid, created_by_email text)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'list_blog_post_versions: admin access required'; end if;
  return query
    select p.id, p.version, p.payload, p.notes, p.is_live, p.created_at, p.created_by,
           (select email from auth.users u where u.id = p.created_by)::text
    from blog_posts p
    where p.slug = p_slug
    order by p.version desc;
end;
$$;
grant execute on function list_blog_post_versions(text) to authenticated;

-- Admin: save a new (non-live) draft version.
create or replace function create_blog_post_version(p_slug text, p_payload jsonb, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not is_admin() then raise exception 'create_blog_post_version: admin access required'; end if;
  if p_payload is null then raise exception 'create_blog_post_version: payload required'; end if;
  insert into blog_posts (slug, payload, notes, created_by, is_live)
  values (p_slug, p_payload, p_notes, auth.uid(), false)
  returning id into new_id;
  perform log_admin_action('blog_post_draft', 'blog_post', p_slug, jsonb_build_object('version_id', new_id));
  return new_id;
end;
$$;
grant execute on function create_blog_post_version(text, jsonb, text) to authenticated;

-- Admin: promote a version to live (one live per slug).
create or replace function set_live_blog_post(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_slug text;
begin
  if not is_admin() then raise exception 'set_live_blog_post: admin access required'; end if;
  select slug into v_slug from blog_posts where id = p_id;
  if v_slug is null then raise exception 'set_live_blog_post: version not found'; end if;
  update blog_posts set is_live = false where slug = v_slug and is_live = true and id <> p_id;
  update blog_posts set is_live = true where id = p_id;
  perform log_admin_action('blog_post_publish', 'blog_post', v_slug, jsonb_build_object('version_id', p_id));
end;
$$;
grant execute on function set_live_blog_post(uuid) to authenticated;

-- =============================================================================
-- Seed — today's single post, verbatim, set live. on-conflict-safe via guard.
-- =============================================================================
do $seed$
declare v_slug text := 'what-is-an-autonomous-ai-bookkeeper';
begin
  if not exists (select 1 from blog_posts where slug = v_slug) then
    insert into blog_posts (slug, payload, notes, is_live)
    values (
      v_slug,
      $json${
        "slug": "what-is-an-autonomous-ai-bookkeeper",
        "title": "What is an autonomous AI bookkeeper?",
        "description": "An autonomous AI bookkeeper keeps your books done for you — categorizing every transaction, chasing late invoices, and staying CPA-ready 24/7, with read-only access that can never move your money.",
        "date": "2026-06-20",
        "readMins": 5,
        "tag": "Guides",
        "takeaways": [
          "An autonomous AI bookkeeper does the books for you — it's not a tool you operate.",
          "It categorizes every transaction, chases late invoices, and stays CPA-ready 24/7.",
          "Read-only by design — it can see and sort transactions but can never move money.",
          "No year-end scramble: clean, receipt-matched books every day, not just in April."
        ],
        "body": [
          { "p": "Most founders don't want to do bookkeeping. They want it done. An autonomous AI bookkeeper is software that does the books for you — not a tool you operate, and not a monthly hand-off to a human service. It connects to the accounts your business already runs on and keeps your records clean continuously." },
          { "stats": [
            { "value": "24/7", "label": "always watching your accounts" },
            { "value": "100%", "label": "transactions categorized" },
            { "value": "$0", "label": "for your first 3 months" }
          ] },
          { "h": "How it's different from QuickBooks or Xero" },
          { "p": "QuickBooks and Xero are ledgers you operate: you (or a bookkeeper) still do the data entry, set the rules, and reconcile. An autonomous bookkeeper like Penny watches Stripe, your bank, and your cards and categorizes each transaction the moment it lands — the way your CPA needs it — so the books are current without anyone maintaining them." },
          { "visual": "operate-vs-penny" },
          { "h": "What it actually does, day to day" },
          { "p": "It sorts every transaction, surfaces your real profit (not just revenue), and chases late invoices with friendly reminders in your voice. A few times a week it may ask a one-tap question — \"business or personal?\" — and it remembers your answer next time." },
          { "visual": "glance" },
          { "quote": "The best bookkeeping is the kind you never have to think about." },
          { "h": "Is it safe?" },
          { "p": "A well-built autonomous bookkeeper connects with read-only access: it can see and sort transactions but can never move a cent. Data is encrypted in transit and at rest, on the same rails your bank uses, and your books stay yours — exportable or deletable anytime." },
          { "visual": "readonly" },
          { "h": "Why it matters at tax time" },
          { "p": "Because the books are categorized and receipt-matched every day, there's no year-end scramble. Your accountant gets clean, CPA-ready records on demand — every day of the year, not just in April." },
          { "callout": { "title": "The short version", "text": "An autonomous AI bookkeeper turns bookkeeping from a recurring chore into something that simply runs — accurately, safely, and continuously — so you can spend your time on the business instead of the books." } }
        ]
      }$json$::jsonb,
      'Seeded from posts.ts',
      true
    );
  end if;
end;
$seed$;
