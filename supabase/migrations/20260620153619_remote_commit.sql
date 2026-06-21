drop extension if exists "pg_net";


  create table "public"."admin_audit" (
    "id" uuid not null default gen_random_uuid(),
    "actor_email" text not null,
    "action" text not null,
    "target_type" text,
    "target_id" text,
    "payload" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."admin_audit" enable row level security;


  create table "public"."admin_users" (
    "id" uuid not null default gen_random_uuid(),
    "email" text not null,
    "added_at" timestamp with time zone not null default now(),
    "added_by" text
      );


alter table "public"."admin_users" enable row level security;


  create table "public"."events" (
    "id" uuid not null default gen_random_uuid(),
    "event_name" text not null,
    "props" jsonb not null default '{}'::jsonb,
    "source" text,
    "actor_email" text,
    "anon_id" text,
    "user_agent" text,
    "referrer" text,
    "path" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."events" enable row level security;


  create table "public"."penny_prompts" (
    "id" uuid not null default gen_random_uuid(),
    "version" integer not null,
    "body" text not null,
    "notes" text,
    "is_live" boolean not null default false,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid
      );


alter table "public"."penny_prompts" enable row level security;


  create table "public"."penny_site_chats" (
    "id" uuid not null default gen_random_uuid(),
    "session_id" text not null,
    "turn_index" integer not null,
    "role" text not null,
    "message" text not null,
    "cta_emitted" boolean not null default false,
    "tone" text,
    "on_waitlist" boolean not null default false,
    "soft_decline" boolean not null default false,
    "buying_signal" boolean not null default false,
    "user_agent" text,
    "referrer" text,
    "page_url" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."penny_site_chats" enable row level security;


  create table "public"."penny_site_leads" (
    "id" uuid not null default gen_random_uuid(),
    "session_id" text not null,
    "kind" text not null,
    "value" text not null,
    "source" text not null,
    "user_agent" text,
    "referrer" text,
    "page_url" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."penny_site_leads" enable row level security;


  create table "public"."support_contacts" (
    "id" uuid not null default gen_random_uuid(),
    "email" text,
    "discord_user_id" text,
    "discord_username" text,
    "created_at" timestamp with time zone not null default now(),
    "last_seen_at" timestamp with time zone not null default now()
      );


alter table "public"."support_contacts" enable row level security;


  create table "public"."support_feedback" (
    "id" uuid not null default gen_random_uuid(),
    "source" text not null,
    "ticket_id" uuid,
    "channel" text,
    "conversation_ref" text,
    "rating" text not null,
    "comment" text,
    "contact_id" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."support_feedback" enable row level security;


  create table "public"."support_messages" (
    "id" uuid not null default gen_random_uuid(),
    "ticket_id" uuid not null,
    "author" text not null,
    "body" text not null,
    "created_at" timestamp with time zone not null default now(),
    "delivered_to_channel_at" timestamp with time zone
      );


alter table "public"."support_messages" enable row level security;


  create table "public"."support_tickets" (
    "id" uuid not null default gen_random_uuid(),
    "contact_id" uuid not null,
    "channel" text not null,
    "channel_thread_ref" text not null,
    "status" text not null default 'open'::text,
    "priority" text not null default 'p2'::text,
    "subject" text not null,
    "first_message" text not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "resolved_at" timestamp with time zone,
    "bot_confidence" text,
    "bot_reason" text,
    "topic" text
      );


alter table "public"."support_tickets" enable row level security;


  create table "public"."waitlist" (
    "id" uuid not null default gen_random_uuid(),
    "email" text not null,
    "source" text,
    "signed_up_at" timestamp with time zone default now(),
    "slug" text,
    "referred_by" text
      );


alter table "public"."waitlist" enable row level security;

CREATE UNIQUE INDEX admin_audit_pkey ON public.admin_audit USING btree (id);

CREATE UNIQUE INDEX admin_users_email_key ON public.admin_users USING btree (email);

CREATE UNIQUE INDEX admin_users_pkey ON public.admin_users USING btree (id);

CREATE UNIQUE INDEX events_pkey ON public.events USING btree (id);

CREATE INDEX idx_admin_audit_action ON public.admin_audit USING btree (action, created_at DESC);

CREATE INDEX idx_admin_audit_actor ON public.admin_audit USING btree (actor_email, created_at DESC);

CREATE INDEX idx_admin_audit_created ON public.admin_audit USING btree (created_at DESC);

CREATE INDEX idx_admin_audit_target ON public.admin_audit USING btree (target_type, target_id);

CREATE INDEX idx_admin_users_email_lower ON public.admin_users USING btree (lower(email));

CREATE INDEX idx_events_actor ON public.events USING btree (actor_email, created_at) WHERE (actor_email IS NOT NULL);

CREATE INDEX idx_events_anon ON public.events USING btree (anon_id, created_at) WHERE (anon_id IS NOT NULL);

CREATE INDEX idx_events_created ON public.events USING btree (created_at DESC);

CREATE INDEX idx_events_name_time ON public.events USING btree (event_name, created_at DESC);

CREATE INDEX idx_support_contacts_discord ON public.support_contacts USING btree (discord_user_id) WHERE (discord_user_id IS NOT NULL);

CREATE INDEX idx_support_contacts_email ON public.support_contacts USING btree (lower(email)) WHERE (email IS NOT NULL);

CREATE UNIQUE INDEX idx_support_feedback_conv_source ON public.support_feedback USING btree (channel, conversation_ref, source) WHERE ((ticket_id IS NULL) AND (conversation_ref IS NOT NULL));

CREATE INDEX idx_support_feedback_created ON public.support_feedback USING btree (created_at DESC);

CREATE UNIQUE INDEX idx_support_feedback_ticket_source ON public.support_feedback USING btree (ticket_id, source) WHERE (ticket_id IS NOT NULL);

CREATE INDEX idx_support_messages_admin_pending ON public.support_messages USING btree (created_at) WHERE ((author = 'admin'::text) AND (delivered_to_channel_at IS NULL));

CREATE INDEX idx_support_messages_ticket ON public.support_messages USING btree (ticket_id, created_at);

CREATE INDEX idx_support_tickets_channel_ref ON public.support_tickets USING btree (channel, channel_thread_ref);

CREATE INDEX idx_support_tickets_contact ON public.support_tickets USING btree (contact_id);

CREATE INDEX idx_support_tickets_status ON public.support_tickets USING btree (status, created_at DESC);

CREATE INDEX idx_support_tickets_topic ON public.support_tickets USING btree (topic, created_at DESC) WHERE (topic IS NOT NULL);

CREATE UNIQUE INDEX penny_prompts_one_live ON public.penny_prompts USING btree (is_live) WHERE (is_live = true);

CREATE UNIQUE INDEX penny_prompts_pkey ON public.penny_prompts USING btree (id);

CREATE INDEX penny_site_chats_created_idx ON public.penny_site_chats USING btree (created_at DESC);

CREATE UNIQUE INDEX penny_site_chats_pkey ON public.penny_site_chats USING btree (id);

CREATE INDEX penny_site_chats_session_idx ON public.penny_site_chats USING btree (session_id, turn_index);

CREATE INDEX penny_site_leads_created_idx ON public.penny_site_leads USING btree (created_at DESC);

CREATE UNIQUE INDEX penny_site_leads_pkey ON public.penny_site_leads USING btree (id);

CREATE UNIQUE INDEX penny_site_leads_session_id_kind_value_key ON public.penny_site_leads USING btree (session_id, kind, value);

CREATE INDEX penny_site_leads_value_idx ON public.penny_site_leads USING btree (value);

CREATE UNIQUE INDEX support_contacts_pkey ON public.support_contacts USING btree (id);

CREATE UNIQUE INDEX support_feedback_pkey ON public.support_feedback USING btree (id);

CREATE UNIQUE INDEX support_messages_pkey ON public.support_messages USING btree (id);

CREATE UNIQUE INDEX support_tickets_pkey ON public.support_tickets USING btree (id);

CREATE UNIQUE INDEX waitlist_email_key ON public.waitlist USING btree (email);

CREATE UNIQUE INDEX waitlist_pkey ON public.waitlist USING btree (id);

CREATE INDEX waitlist_referred_by_idx ON public.waitlist USING btree (referred_by);

CREATE UNIQUE INDEX waitlist_slug_key ON public.waitlist USING btree (slug);

alter table "public"."admin_audit" add constraint "admin_audit_pkey" PRIMARY KEY using index "admin_audit_pkey";

alter table "public"."admin_users" add constraint "admin_users_pkey" PRIMARY KEY using index "admin_users_pkey";

alter table "public"."events" add constraint "events_pkey" PRIMARY KEY using index "events_pkey";

alter table "public"."penny_prompts" add constraint "penny_prompts_pkey" PRIMARY KEY using index "penny_prompts_pkey";

alter table "public"."penny_site_chats" add constraint "penny_site_chats_pkey" PRIMARY KEY using index "penny_site_chats_pkey";

alter table "public"."penny_site_leads" add constraint "penny_site_leads_pkey" PRIMARY KEY using index "penny_site_leads_pkey";

alter table "public"."support_contacts" add constraint "support_contacts_pkey" PRIMARY KEY using index "support_contacts_pkey";

alter table "public"."support_feedback" add constraint "support_feedback_pkey" PRIMARY KEY using index "support_feedback_pkey";

alter table "public"."support_messages" add constraint "support_messages_pkey" PRIMARY KEY using index "support_messages_pkey";

alter table "public"."support_tickets" add constraint "support_tickets_pkey" PRIMARY KEY using index "support_tickets_pkey";

alter table "public"."waitlist" add constraint "waitlist_pkey" PRIMARY KEY using index "waitlist_pkey";

alter table "public"."admin_users" add constraint "admin_users_email_key" UNIQUE using index "admin_users_email_key";

alter table "public"."penny_prompts" add constraint "penny_prompts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."penny_prompts" validate constraint "penny_prompts_created_by_fkey";

alter table "public"."penny_site_chats" add constraint "penny_site_chats_role_check" CHECK ((role = ANY (ARRAY['user'::text, 'penny'::text]))) not valid;

alter table "public"."penny_site_chats" validate constraint "penny_site_chats_role_check";

alter table "public"."penny_site_chats" add constraint "penny_site_chats_tone_check" CHECK (((tone = ANY (ARRAY['fyi'::text, 'action'::text, 'celebration'::text, 'flag'::text])) OR (tone IS NULL))) not valid;

alter table "public"."penny_site_chats" validate constraint "penny_site_chats_tone_check";

alter table "public"."penny_site_leads" add constraint "penny_site_leads_kind_check" CHECK ((kind = ANY (ARRAY['email'::text, 'phone'::text]))) not valid;

alter table "public"."penny_site_leads" validate constraint "penny_site_leads_kind_check";

alter table "public"."penny_site_leads" add constraint "penny_site_leads_session_id_kind_value_key" UNIQUE using index "penny_site_leads_session_id_kind_value_key";

alter table "public"."penny_site_leads" add constraint "penny_site_leads_source_check" CHECK ((source = ANY (ARRAY['waitlist'::text, 'follow_up'::text, 'volunteered'::text]))) not valid;

alter table "public"."penny_site_leads" validate constraint "penny_site_leads_source_check";

alter table "public"."support_contacts" add constraint "support_contacts_has_identity" CHECK (((email IS NOT NULL) OR (discord_user_id IS NOT NULL))) not valid;

alter table "public"."support_contacts" validate constraint "support_contacts_has_identity";

alter table "public"."support_feedback" add constraint "support_feedback_channel_check" CHECK ((channel = ANY (ARRAY['discord'::text, 'web'::text]))) not valid;

alter table "public"."support_feedback" validate constraint "support_feedback_channel_check";

alter table "public"."support_feedback" add constraint "support_feedback_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES public.support_contacts(id) ON DELETE SET NULL not valid;

alter table "public"."support_feedback" validate constraint "support_feedback_contact_id_fkey";

alter table "public"."support_feedback" add constraint "support_feedback_has_target" CHECK (((ticket_id IS NOT NULL) OR ((channel IS NOT NULL) AND (conversation_ref IS NOT NULL)))) not valid;

alter table "public"."support_feedback" validate constraint "support_feedback_has_target";

alter table "public"."support_feedback" add constraint "support_feedback_rating_check" CHECK ((rating = ANY (ARRAY['up'::text, 'down'::text]))) not valid;

alter table "public"."support_feedback" validate constraint "support_feedback_rating_check";

alter table "public"."support_feedback" add constraint "support_feedback_source_check" CHECK ((source = ANY (ARRAY['bot_resolved'::text, 'admin_resolved'::text]))) not valid;

alter table "public"."support_feedback" validate constraint "support_feedback_source_check";

alter table "public"."support_feedback" add constraint "support_feedback_ticket_id_fkey" FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE not valid;

alter table "public"."support_feedback" validate constraint "support_feedback_ticket_id_fkey";

alter table "public"."support_messages" add constraint "support_messages_author_check" CHECK ((author = ANY (ARRAY['user'::text, 'bot'::text, 'admin'::text]))) not valid;

alter table "public"."support_messages" validate constraint "support_messages_author_check";

alter table "public"."support_messages" add constraint "support_messages_ticket_id_fkey" FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE not valid;

alter table "public"."support_messages" validate constraint "support_messages_ticket_id_fkey";

alter table "public"."support_tickets" add constraint "support_tickets_channel_check" CHECK ((channel = ANY (ARRAY['discord'::text, 'web'::text]))) not valid;

alter table "public"."support_tickets" validate constraint "support_tickets_channel_check";

alter table "public"."support_tickets" add constraint "support_tickets_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES public.support_contacts(id) ON DELETE CASCADE not valid;

alter table "public"."support_tickets" validate constraint "support_tickets_contact_id_fkey";

alter table "public"."support_tickets" add constraint "support_tickets_priority_check" CHECK ((priority = ANY (ARRAY['p1'::text, 'p2'::text, 'p3'::text]))) not valid;

alter table "public"."support_tickets" validate constraint "support_tickets_priority_check";

alter table "public"."support_tickets" add constraint "support_tickets_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text]))) not valid;

alter table "public"."support_tickets" validate constraint "support_tickets_status_check";

alter table "public"."waitlist" add constraint "waitlist_email_key" UNIQUE using index "waitlist_email_key";

alter table "public"."waitlist" add constraint "waitlist_slug_key" UNIQUE using index "waitlist_slug_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.admin_audit_facets()
 RETURNS TABLE(actions text[], actors text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin() then raise exception 'admin_audit_facets: admin access required'; end if;
  return query
    select
      (select coalesce(array_agg(distinct action      order by action),      '{}') from admin_audit),
      (select coalesce(array_agg(distinct actor_email order by actor_email), '{}') from admin_audit);
end; $function$
;

CREATE OR REPLACE FUNCTION public.admin_events_daily(p_since timestamp with time zone DEFAULT (now() - '30 days'::interval))
 RETURNS TABLE(day date, total bigint, identified bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin() then
    raise exception 'admin_events_daily: admin access required';
  end if;

  return query
    select
      (e.created_at at time zone 'UTC')::date as day,
      count(*)::bigint                        as total,
      count(*) filter (where e.anon_id is not null)::bigint as identified
    from events e
    where e.created_at >= p_since
    group by 1
    order by 1;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_funnel(p_since timestamp with time zone DEFAULT (now() - '30 days'::interval), p_until timestamp with time zone DEFAULT now())
 RETURNS TABLE(stage text, stage_order integer, visitors bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin() then
    raise exception 'admin_funnel: admin access required';
  end if;

  return query
    with windowed as (
      select event_name, anon_id, actor_email, created_at
      from events
      where created_at >= p_since
        and created_at <  p_until
        and anon_id is not null
    ),
    stages(stage, stage_order, event_name) as (
      values
        ('Visited',            1, 'page_view'),
        ('Opened Penny',       2, 'penny_opened'),
        ('Sent a message',     3, 'penny_message_sent'),
        ('Joined waitlist',    4, 'waitlist_signup'),
        ('Came back (D1+)',    5, 'return_visit')
    )
    select
      s.stage,
      s.stage_order,
      coalesce(count(distinct w.anon_id), 0) as visitors
    from stages s
    left join windowed w on w.event_name = s.event_name
    group by s.stage, s.stage_order
    order by s.stage_order;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_list_audit(p_action text DEFAULT NULL::text, p_actor text DEFAULT NULL::text, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 200)
 RETURNS TABLE(id uuid, actor_email text, action text, target_type text, target_id text, payload jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin() then raise exception 'admin_list_audit: admin access required'; end if;
  return query
    select a.id, a.actor_email, a.action, a.target_type, a.target_id, a.payload, a.created_at
    from admin_audit a
    where (p_action is null or a.action = p_action)
      and (p_actor  is null or a.actor_email = p_actor)
      and (p_since  is null or a.created_at >= p_since)
    order by a.created_at desc
    limit greatest(1, least(p_limit, 1000));
end; $function$
;

CREATE OR REPLACE FUNCTION public.admin_list_events(p_event_name text DEFAULT NULL::text, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 200)
 RETURNS TABLE(id uuid, event_name text, props jsonb, source text, actor_email text, anon_id text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin() then
    raise exception 'admin_list_events: admin access required';
  end if;

  return query
    select e.id, e.event_name, e.props, e.source, e.actor_email, e.anon_id, e.created_at
    from events e
    where (p_event_name is null or e.event_name = p_event_name)
      and (p_since is null or e.created_at >= p_since)
    order by e.created_at desc
    limit greatest(1, least(p_limit, 1000));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_list_waitlist(p_limit integer DEFAULT 500, p_search text DEFAULT NULL::text)
 RETURNS TABLE(row_data jsonb, signed_up_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin() then
    raise exception 'admin_list_waitlist: admin access required';
  end if;

  return query
    select
      to_jsonb(w.*)      as row_data,
      w.signed_up_at     as signed_up_at
    from waitlist w
    where p_search is null
       or w.email ilike '%' || p_search || '%'
    order by w.signed_up_at desc
    limit greatest(1, least(p_limit, 5000));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_waitlist_daily(p_days integer DEFAULT 30)
 RETURNS TABLE(day date, signups bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin() then
    raise exception 'admin_waitlist_daily: admin access required';
  end if;

  return query
    select
      (w.signed_up_at at time zone 'UTC')::date as day,
      count(*)                                  as signups
    from waitlist w
    where w.signed_up_at >= now() - (greatest(1, least(p_days, 365)) || ' days')::interval
    group by 1
    order by 1;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_waitlist_leaderboard(p_limit integer DEFAULT 10)
 RETURNS TABLE(referrer_slug text, referrer_email text, referred_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin() then raise exception 'admin_waitlist_leaderboard: admin access required'; end if;
  return query
    select r.referred_by, max(ref.email), count(*)::bigint
    from waitlist r
    left join waitlist ref on ref.slug = r.referred_by
    where r.referred_by is not null
    group by r.referred_by
    order by 3 desc
    limit greatest(1, least(p_limit, 100));
end; $function$
;

CREATE OR REPLACE FUNCTION public.admin_waitlist_sources()
 RETURNS TABLE(source text, signups bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin() then
    raise exception 'admin_waitlist_sources: admin access required';
  end if;

  return query
    select
      coalesce(w.source, '(none)') as source,
      count(*)                     as signups
    from waitlist w
    group by 1
    order by 2 desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.append_message(p_ticket_id uuid, p_author text, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_message_id uuid;
begin
  if p_author not in ('user', 'bot') then
    raise exception 'append_message: author must be user or bot (admin uses reply_to_ticket)';
  end if;

  insert into support_messages (ticket_id, author, body)
    values (p_ticket_id, p_author, p_body)
    returning id into v_message_id;

  update support_tickets
    set updated_at = now()
    where id = p_ticket_id;

  return v_message_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_prompt_version(p_body text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare new_id uuid;
begin
  if not is_admin() then raise exception 'create_prompt_version: admin access required'; end if;
  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'create_prompt_version: body cannot be empty';
  end if;
  insert into penny_prompts (body, notes, created_by, is_live)
  values (p_body, p_notes, auth.uid(), false) returning id into new_id;
  return new_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_ticket(p_email text, p_discord_user_id text, p_discord_username text, p_channel text, p_channel_thread_ref text, p_subject text, p_first_message text, p_bot_reply text, p_priority text DEFAULT 'p2'::text, p_bot_confidence text DEFAULT 'low'::text, p_bot_reason text DEFAULT NULL::text, p_topic text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_contact_id uuid;
  v_ticket_id  uuid;
begin
  if p_email is not null then
    select id into v_contact_id
      from support_contacts
      where lower(email) = lower(p_email)
      limit 1;
  end if;

  if v_contact_id is null and p_discord_user_id is not null then
    select id into v_contact_id
      from support_contacts
      where discord_user_id = p_discord_user_id
      limit 1;
  end if;

  if v_contact_id is null then
    insert into support_contacts (email, discord_user_id, discord_username)
      values (p_email, p_discord_user_id, p_discord_username)
      returning id into v_contact_id;
  else
    update support_contacts
      set last_seen_at     = now(),
          email            = coalesce(email, p_email),
          discord_user_id  = coalesce(discord_user_id, p_discord_user_id),
          discord_username = coalesce(discord_username, p_discord_username)
      where id = v_contact_id;
  end if;

  insert into support_tickets (
    contact_id, channel, channel_thread_ref,
    priority, subject, first_message,
    bot_confidence, bot_reason, topic
  )
  values (
    v_contact_id, p_channel, p_channel_thread_ref,
    coalesce(p_priority, 'p2'), p_subject, p_first_message,
    p_bot_confidence, p_bot_reason, p_topic
  )
  returning id into v_ticket_id;

  insert into support_messages (ticket_id, author, body)
    values (v_ticket_id, 'user', p_first_message);

  if p_bot_reply is not null then
    insert into support_messages (ticket_id, author, body)
      values (v_ticket_id, 'bot', p_bot_reply);
  end if;

  return v_ticket_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fetch_undelivered_admin_messages()
 RETURNS TABLE(message_id uuid, ticket_id uuid, channel text, channel_thread_ref text, body text, ticket_subject text, ticket_status text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with claimed as (
    update support_messages
    set delivered_to_channel_at = now()
    where id in (
      select id from support_messages
      where author = 'admin' and delivered_to_channel_at is null
      order by created_at
      limit 50
      for update skip locked
    )
    returning id as message_id, ticket_id, body
  )
  select
    c.message_id,
    c.ticket_id,
    t.channel,
    t.channel_thread_ref,
    c.body,
    t.subject as ticket_subject,
    t.status  as ticket_status
  from claimed c
  join support_tickets t on t.id = c.ticket_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_analytics()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_now              timestamptz := now();
  v_open             bigint;
  v_in_progress      bigint;
  v_stale            bigint;
  v_resolved_7d      bigint;
  v_opened_7d        bigint;
  v_avg_resp_min     numeric;
  v_opens_by_day     jsonb;
  v_resolves_by_day  jsonb;
  v_channel_30d      jsonb;
  v_priority_30d     jsonb;
  v_topic_30d        jsonb;
  v_csat_up_7d       bigint;
  v_csat_down_7d     bigint;
  v_csat_total_7d    bigint;
  v_csat_score_pct   numeric;
begin
  if auth.uid() is null then
    raise exception 'get_analytics: authentication required';
  end if;

  select count(*) into v_open
    from support_tickets where status = 'open';
  select count(*) into v_in_progress
    from support_tickets where status = 'in_progress';
  select count(*) into v_stale
    from support_tickets
    where status in ('open', 'in_progress')
      and (case when status = 'open' then created_at else updated_at end)
          < v_now - interval '24 hours';
  select count(*) into v_resolved_7d
    from support_tickets
    where resolved_at is not null and resolved_at >= v_now - interval '7 days';
  select count(*) into v_opened_7d
    from support_tickets where created_at >= v_now - interval '7 days';

  with first_admin as (
    select t.id as ticket_id, t.created_at,
           min(m.created_at) as first_admin_at
      from support_tickets t
      join support_messages m on m.ticket_id = t.id and m.author = 'admin'
     where t.resolved_at is not null
       and t.resolved_at >= v_now - interval '7 days'
     group by t.id, t.created_at
  )
  select round(avg(extract(epoch from (first_admin_at - created_at)) / 60.0)::numeric, 1)
    into v_avg_resp_min from first_admin;

  with days as (
    select generate_series((v_now - interval '13 days')::date, v_now::date, interval '1 day')::date as day
  )
  select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'count', coalesce(c.n, 0)) order by d.day), '[]'::jsonb)
    into v_opens_by_day
    from days d
    left join (
      select created_at::date as day, count(*)::int as n
        from support_tickets where created_at >= v_now - interval '14 days' group by 1
    ) c on c.day = d.day;

  with days as (
    select generate_series((v_now - interval '13 days')::date, v_now::date, interval '1 day')::date as day
  )
  select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'count', coalesce(c.n, 0)) order by d.day), '[]'::jsonb)
    into v_resolves_by_day
    from days d
    left join (
      select resolved_at::date as day, count(*)::int as n
        from support_tickets where resolved_at is not null and resolved_at >= v_now - interval '14 days' group by 1
    ) c on c.day = d.day;

  select coalesce(jsonb_object_agg(channel, n), '{}'::jsonb) into v_channel_30d
    from (select channel, count(*)::int as n from support_tickets where created_at >= v_now - interval '30 days' group by channel) x;

  select coalesce(jsonb_object_agg(priority, n), '{}'::jsonb) into v_priority_30d
    from (select priority, count(*)::int as n from support_tickets where created_at >= v_now - interval '30 days' group by priority) x;

  -- topic_30d: { topic: n, ... } including 'untagged' bucket for nulls
  select coalesce(jsonb_object_agg(coalesce(topic, 'untagged'), n), '{}'::jsonb) into v_topic_30d
    from (
      select topic, count(*)::int as n
        from support_tickets
       where created_at >= v_now - interval '30 days'
       group by topic
    ) x;

  select count(*) filter (where rating = 'up'),
         count(*) filter (where rating = 'down'),
         count(*)
    into v_csat_up_7d, v_csat_down_7d, v_csat_total_7d
    from support_feedback where created_at >= v_now - interval '7 days';

  v_csat_score_pct := case
    when v_csat_total_7d = 0 then null
    else round((v_csat_up_7d::numeric / v_csat_total_7d::numeric) * 100, 0)
  end;

  return jsonb_build_object(
    'now',                v_now,
    'open_count',         v_open,
    'in_progress',        v_in_progress,
    'stale_count',        v_stale,
    'resolved_7d',        v_resolved_7d,
    'opened_7d',          v_opened_7d,
    'avg_first_response_minutes_7d', v_avg_resp_min,
    'opens_by_day',       v_opens_by_day,
    'resolves_by_day',    v_resolves_by_day,
    'channel_30d',        v_channel_30d,
    'priority_30d',       v_priority_30d,
    'topic_30d',          v_topic_30d,
    'csat_7d', jsonb_build_object(
      'up', v_csat_up_7d, 'down', v_csat_down_7d,
      'count', v_csat_total_7d, 'score_pct', v_csat_score_pct
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_feedback_for_ticket(p_ticket_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row jsonb;
begin
  if auth.uid() is null then
    raise exception 'get_feedback_for_ticket: authentication required';
  end if;

  select to_jsonb(f.*) into v_row
    from support_feedback f
    where f.ticket_id = p_ticket_id
    order by f.created_at desc
    limit 1;

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_live_prompt()
 RETURNS TABLE(id uuid, version integer, body text, updated_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id, version, body, created_at as updated_at
  from penny_prompts where is_live = true limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_ticket(p_ticket_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_result jsonb;
begin
  if not is_admin() then
    raise exception 'get_ticket: admin access required';
  end if;

  select jsonb_build_object(
    'ticket',   to_jsonb(t.*) - 'contact_id'
                  || jsonb_build_object(
                       'contact_email',    c.email,
                       'contact_discord',  c.discord_username
                     ),
    'messages', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', m.id,
                'author', m.author,
                'body', m.body,
                'created_at', m.created_at
              ) order by m.created_at)
       from support_messages m
       where m.ticket_id = t.id),
      '[]'::jsonb
    )
  )
  into v_result
  from support_tickets t
  join support_contacts c on c.id = t.contact_id
  where t.id = p_ticket_id;

  if v_result is null then
    raise exception 'get_ticket: ticket not found';
  end if;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from admin_users
    where lower(email) = lower(coalesce(auth.email(), ''))
  );
$function$
;

CREATE OR REPLACE FUNCTION public.list_prompts()
 RETURNS TABLE(id uuid, version integer, body text, notes text, is_live boolean, created_at timestamp with time zone, created_by uuid, created_by_email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin() then raise exception 'list_prompts: admin access required'; end if;
  return query
    select p.id, p.version, p.body, p.notes, p.is_live, p.created_at, p.created_by,
      (select email from auth.users u where u.id = p.created_by)::text
    from penny_prompts p order by p.version desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_recent_feedback(p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, source text, rating text, comment text, channel text, ticket_id uuid, ticket_subject text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'list_recent_feedback: authentication required';
  end if;

  return query
    select
      f.id,
      f.source,
      f.rating,
      f.comment,
      coalesce(f.channel, t.channel) as channel,
      f.ticket_id,
      t.subject as ticket_subject,
      f.created_at
    from support_feedback f
    left join support_tickets t on t.id = f.ticket_id
    order by f.created_at desc
    limit greatest(1, least(p_limit, 100));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_tickets(p_status text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, status text, priority text, channel text, subject text, first_message text, contact_email text, contact_discord text, topic text, created_at timestamp with time zone, updated_at timestamp with time zone, message_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'list_tickets: authentication required';
  end if;

  return query
    select
      t.id, t.status, t.priority, t.channel, t.subject, t.first_message,
      c.email as contact_email, c.discord_username as contact_discord,
      t.topic,
      t.created_at, t.updated_at,
      (select count(*) from support_messages m where m.ticket_id = t.id) as message_count
    from support_tickets t
    join support_contacts c on c.id = t.contact_id
    where p_status is null or t.status = p_status
    order by
      case t.priority when 'p1' then 1 when 'p2' then 2 else 3 end,
      t.created_at desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.log_admin_action(p_action text, p_target_type text DEFAULT NULL::text, p_target_id text DEFAULT NULL::text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_email text;
begin
  if not is_admin() then raise exception 'log_admin_action: admin access required'; end if;
  v_email := coalesce(auth.email(), 'unknown');
  insert into admin_audit (actor_email, action, target_type, target_id, payload)
    values (v_email, p_action, p_target_type, p_target_id, coalesce(p_payload, '{}'::jsonb))
    returning id into v_id;
  return v_id;
end; $function$
;

CREATE OR REPLACE FUNCTION public.penny_prompts_set_version()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.version is null then
    select coalesce(max(version), 0) + 1 into new.version from penny_prompts;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.penny_site_chats_purge()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  delete from public.penny_site_chats c
  where c.created_at < now() - interval '90 days'
    and not exists (
      select 1 from public.penny_site_leads l
      where l.session_id = c.session_id
        and l.source = 'waitlist'
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.referral_count(p_slug text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)::INT
  FROM public.waitlist
  WHERE referred_by = p_slug;
$function$
;

CREATE OR REPLACE FUNCTION public.reply_to_ticket(p_ticket_id uuid, p_body text, p_resolve boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_message_id uuid;
begin
  if not is_admin() then
    raise exception 'reply_to_ticket: admin access required';
  end if;

  insert into support_messages (ticket_id, author, body)
    values (p_ticket_id, 'admin', p_body)
    returning id into v_message_id;

  update support_tickets
    set status      = case when p_resolve then 'resolved' else 'in_progress' end,
        resolved_at = case when p_resolve then now() else resolved_at end,
        updated_at  = now()
    where id = p_ticket_id;

  return v_message_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_live_prompt(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin() then raise exception 'set_live_prompt: admin access required'; end if;
  if not exists (select 1 from penny_prompts where id = p_id) then
    raise exception 'set_live_prompt: version not found';
  end if;
  update penny_prompts set is_live = false where is_live = true and id <> p_id;
  update penny_prompts set is_live = true  where id = p_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_ticket_topic(p_ticket_id uuid, p_topic text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'set_ticket_topic: authentication required';
  end if;

  update support_tickets
    set topic      = nullif(trim(p_topic), ''),
        updated_at = now()
    where id = p_ticket_id;

  if not found then
    raise exception 'set_ticket_topic: ticket not found';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.signup_to_waitlist(p_email text, p_source text DEFAULT 'waitlist'::text, p_referred_by text DEFAULT NULL::text, p_slug_seed text DEFAULT NULL::text)
 RETURNS TABLE(slug text, already_on_list boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email   text := lower(trim(p_email));
  v_slug    text;
  v_existing text;
  v_attempt int := 0;
begin
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;

  select w.slug into v_existing from public.waitlist w where w.email = v_email;
  if v_existing is not null then
    return query select v_existing, true;
    return;
  end if;

  while v_attempt < 5 loop
    v_slug := coalesce(nullif(p_slug_seed, ''), regexp_replace(split_part(v_email, '@', 1), '[^a-z0-9]', '', 'g'))
              || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 4);
    begin
      insert into public.waitlist (email, source, slug, referred_by)
      values (v_email, coalesce(p_source, 'waitlist'), v_slug, p_referred_by);
      return query select v_slug, false;
      return;
    exception when unique_violation then
      v_attempt := v_attempt + 1;
    end;
  end loop;

  raise exception 'could not allocate slug' using errcode = 'P0001';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_feedback(p_source text, p_ticket_id uuid DEFAULT NULL::uuid, p_channel text DEFAULT NULL::text, p_conversation_ref text DEFAULT NULL::text, p_rating text DEFAULT NULL::text, p_comment text DEFAULT NULL::text, p_contact_email text DEFAULT NULL::text, p_discord_user_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_contact_id uuid;
  v_id         uuid;
begin
  if p_rating not in ('up', 'down') then
    raise exception 'submit_feedback: rating must be up or down';
  end if;
  if p_source not in ('bot_resolved', 'admin_resolved') then
    raise exception 'submit_feedback: invalid source';
  end if;
  if p_ticket_id is null and (p_channel is null or p_conversation_ref is null) then
    raise exception 'submit_feedback: need ticket_id OR (channel + conversation_ref)';
  end if;

  -- Best-effort contact lookup so the score can be attributed.
  if p_contact_email is not null then
    select id into v_contact_id
      from support_contacts
      where lower(email) = lower(p_contact_email)
      limit 1;
  end if;
  if v_contact_id is null and p_discord_user_id is not null then
    select id into v_contact_id
      from support_contacts
      where discord_user_id = p_discord_user_id
      limit 1;
  end if;

  -- Upsert. Use ticket_id when present, else (channel, conversation_ref).
  if p_ticket_id is not null then
    insert into support_feedback (
      source, ticket_id, channel, conversation_ref,
      rating, comment, contact_id
    )
    values (
      p_source, p_ticket_id, p_channel, p_conversation_ref,
      p_rating, p_comment, v_contact_id
    )
    on conflict (ticket_id, source)
    where ticket_id is not null
    do update set
      rating = excluded.rating,
      comment = excluded.comment,
      contact_id = coalesce(excluded.contact_id, support_feedback.contact_id),
      updated_at = now()
    returning id into v_id;
  else
    insert into support_feedback (
      source, channel, conversation_ref,
      rating, comment, contact_id
    )
    values (
      p_source, p_channel, p_conversation_ref,
      p_rating, p_comment, v_contact_id
    )
    on conflict (channel, conversation_ref, source)
    where ticket_id is null and conversation_ref is not null
    do update set
      rating = excluded.rating,
      comment = excluded.comment,
      contact_id = coalesce(excluded.contact_id, support_feedback.contact_id),
      updated_at = now()
    returning id into v_id;
  end if;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.track_event(p_event_name text, p_props jsonb DEFAULT '{}'::jsonb, p_source text DEFAULT NULL::text, p_anon_id text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text, p_referrer text DEFAULT NULL::text, p_path text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  if p_event_name is null or length(p_event_name) = 0 or length(p_event_name) > 80 then
    raise exception 'track_event: invalid event_name';
  end if;
  if octet_length(coalesce(p_props::text, '')) > 16384 then
    raise exception 'track_event: payload too large';
  end if;

  insert into events (event_name, props, source, actor_email, anon_id, user_agent, referrer, path)
    values (
      p_event_name,
      coalesce(p_props, '{}'::jsonb),
      p_source,
      auth.email(),
      p_anon_id,
      p_user_agent,
      p_referrer,
      p_path
    )
    returning id into v_id;

  return v_id;
end;
$function$
;

grant delete on table "public"."admin_audit" to "anon";

grant insert on table "public"."admin_audit" to "anon";

grant references on table "public"."admin_audit" to "anon";

grant select on table "public"."admin_audit" to "anon";

grant trigger on table "public"."admin_audit" to "anon";

grant truncate on table "public"."admin_audit" to "anon";

grant update on table "public"."admin_audit" to "anon";

grant delete on table "public"."admin_audit" to "authenticated";

grant insert on table "public"."admin_audit" to "authenticated";

grant references on table "public"."admin_audit" to "authenticated";

grant select on table "public"."admin_audit" to "authenticated";

grant trigger on table "public"."admin_audit" to "authenticated";

grant truncate on table "public"."admin_audit" to "authenticated";

grant update on table "public"."admin_audit" to "authenticated";

grant delete on table "public"."admin_audit" to "service_role";

grant insert on table "public"."admin_audit" to "service_role";

grant references on table "public"."admin_audit" to "service_role";

grant select on table "public"."admin_audit" to "service_role";

grant trigger on table "public"."admin_audit" to "service_role";

grant truncate on table "public"."admin_audit" to "service_role";

grant update on table "public"."admin_audit" to "service_role";

grant delete on table "public"."admin_users" to "anon";

grant insert on table "public"."admin_users" to "anon";

grant references on table "public"."admin_users" to "anon";

grant select on table "public"."admin_users" to "anon";

grant trigger on table "public"."admin_users" to "anon";

grant truncate on table "public"."admin_users" to "anon";

grant update on table "public"."admin_users" to "anon";

grant delete on table "public"."admin_users" to "authenticated";

grant insert on table "public"."admin_users" to "authenticated";

grant references on table "public"."admin_users" to "authenticated";

grant select on table "public"."admin_users" to "authenticated";

grant trigger on table "public"."admin_users" to "authenticated";

grant truncate on table "public"."admin_users" to "authenticated";

grant update on table "public"."admin_users" to "authenticated";

grant delete on table "public"."admin_users" to "service_role";

grant insert on table "public"."admin_users" to "service_role";

grant references on table "public"."admin_users" to "service_role";

grant select on table "public"."admin_users" to "service_role";

grant trigger on table "public"."admin_users" to "service_role";

grant truncate on table "public"."admin_users" to "service_role";

grant update on table "public"."admin_users" to "service_role";

grant delete on table "public"."events" to "anon";

grant insert on table "public"."events" to "anon";

grant references on table "public"."events" to "anon";

grant select on table "public"."events" to "anon";

grant trigger on table "public"."events" to "anon";

grant truncate on table "public"."events" to "anon";

grant update on table "public"."events" to "anon";

grant delete on table "public"."events" to "authenticated";

grant insert on table "public"."events" to "authenticated";

grant references on table "public"."events" to "authenticated";

grant select on table "public"."events" to "authenticated";

grant trigger on table "public"."events" to "authenticated";

grant truncate on table "public"."events" to "authenticated";

grant update on table "public"."events" to "authenticated";

grant delete on table "public"."events" to "service_role";

grant insert on table "public"."events" to "service_role";

grant references on table "public"."events" to "service_role";

grant select on table "public"."events" to "service_role";

grant trigger on table "public"."events" to "service_role";

grant truncate on table "public"."events" to "service_role";

grant update on table "public"."events" to "service_role";

grant delete on table "public"."penny_prompts" to "anon";

grant insert on table "public"."penny_prompts" to "anon";

grant references on table "public"."penny_prompts" to "anon";

grant select on table "public"."penny_prompts" to "anon";

grant trigger on table "public"."penny_prompts" to "anon";

grant truncate on table "public"."penny_prompts" to "anon";

grant update on table "public"."penny_prompts" to "anon";

grant delete on table "public"."penny_prompts" to "authenticated";

grant insert on table "public"."penny_prompts" to "authenticated";

grant references on table "public"."penny_prompts" to "authenticated";

grant select on table "public"."penny_prompts" to "authenticated";

grant trigger on table "public"."penny_prompts" to "authenticated";

grant truncate on table "public"."penny_prompts" to "authenticated";

grant update on table "public"."penny_prompts" to "authenticated";

grant delete on table "public"."penny_prompts" to "service_role";

grant insert on table "public"."penny_prompts" to "service_role";

grant references on table "public"."penny_prompts" to "service_role";

grant select on table "public"."penny_prompts" to "service_role";

grant trigger on table "public"."penny_prompts" to "service_role";

grant truncate on table "public"."penny_prompts" to "service_role";

grant update on table "public"."penny_prompts" to "service_role";

grant delete on table "public"."penny_site_chats" to "anon";

grant insert on table "public"."penny_site_chats" to "anon";

grant references on table "public"."penny_site_chats" to "anon";

grant select on table "public"."penny_site_chats" to "anon";

grant trigger on table "public"."penny_site_chats" to "anon";

grant truncate on table "public"."penny_site_chats" to "anon";

grant update on table "public"."penny_site_chats" to "anon";

grant delete on table "public"."penny_site_chats" to "authenticated";

grant insert on table "public"."penny_site_chats" to "authenticated";

grant references on table "public"."penny_site_chats" to "authenticated";

grant select on table "public"."penny_site_chats" to "authenticated";

grant trigger on table "public"."penny_site_chats" to "authenticated";

grant truncate on table "public"."penny_site_chats" to "authenticated";

grant update on table "public"."penny_site_chats" to "authenticated";

grant delete on table "public"."penny_site_chats" to "service_role";

grant insert on table "public"."penny_site_chats" to "service_role";

grant references on table "public"."penny_site_chats" to "service_role";

grant select on table "public"."penny_site_chats" to "service_role";

grant trigger on table "public"."penny_site_chats" to "service_role";

grant truncate on table "public"."penny_site_chats" to "service_role";

grant update on table "public"."penny_site_chats" to "service_role";

grant delete on table "public"."penny_site_leads" to "anon";

grant insert on table "public"."penny_site_leads" to "anon";

grant references on table "public"."penny_site_leads" to "anon";

grant select on table "public"."penny_site_leads" to "anon";

grant trigger on table "public"."penny_site_leads" to "anon";

grant truncate on table "public"."penny_site_leads" to "anon";

grant update on table "public"."penny_site_leads" to "anon";

grant delete on table "public"."penny_site_leads" to "authenticated";

grant insert on table "public"."penny_site_leads" to "authenticated";

grant references on table "public"."penny_site_leads" to "authenticated";

grant select on table "public"."penny_site_leads" to "authenticated";

grant trigger on table "public"."penny_site_leads" to "authenticated";

grant truncate on table "public"."penny_site_leads" to "authenticated";

grant update on table "public"."penny_site_leads" to "authenticated";

grant delete on table "public"."penny_site_leads" to "service_role";

grant insert on table "public"."penny_site_leads" to "service_role";

grant references on table "public"."penny_site_leads" to "service_role";

grant select on table "public"."penny_site_leads" to "service_role";

grant trigger on table "public"."penny_site_leads" to "service_role";

grant truncate on table "public"."penny_site_leads" to "service_role";

grant update on table "public"."penny_site_leads" to "service_role";

grant delete on table "public"."support_contacts" to "anon";

grant insert on table "public"."support_contacts" to "anon";

grant references on table "public"."support_contacts" to "anon";

grant select on table "public"."support_contacts" to "anon";

grant trigger on table "public"."support_contacts" to "anon";

grant truncate on table "public"."support_contacts" to "anon";

grant update on table "public"."support_contacts" to "anon";

grant delete on table "public"."support_contacts" to "authenticated";

grant insert on table "public"."support_contacts" to "authenticated";

grant references on table "public"."support_contacts" to "authenticated";

grant select on table "public"."support_contacts" to "authenticated";

grant trigger on table "public"."support_contacts" to "authenticated";

grant truncate on table "public"."support_contacts" to "authenticated";

grant update on table "public"."support_contacts" to "authenticated";

grant delete on table "public"."support_contacts" to "service_role";

grant insert on table "public"."support_contacts" to "service_role";

grant references on table "public"."support_contacts" to "service_role";

grant select on table "public"."support_contacts" to "service_role";

grant trigger on table "public"."support_contacts" to "service_role";

grant truncate on table "public"."support_contacts" to "service_role";

grant update on table "public"."support_contacts" to "service_role";

grant delete on table "public"."support_feedback" to "anon";

grant insert on table "public"."support_feedback" to "anon";

grant references on table "public"."support_feedback" to "anon";

grant select on table "public"."support_feedback" to "anon";

grant trigger on table "public"."support_feedback" to "anon";

grant truncate on table "public"."support_feedback" to "anon";

grant update on table "public"."support_feedback" to "anon";

grant delete on table "public"."support_feedback" to "authenticated";

grant insert on table "public"."support_feedback" to "authenticated";

grant references on table "public"."support_feedback" to "authenticated";

grant select on table "public"."support_feedback" to "authenticated";

grant trigger on table "public"."support_feedback" to "authenticated";

grant truncate on table "public"."support_feedback" to "authenticated";

grant update on table "public"."support_feedback" to "authenticated";

grant delete on table "public"."support_feedback" to "service_role";

grant insert on table "public"."support_feedback" to "service_role";

grant references on table "public"."support_feedback" to "service_role";

grant select on table "public"."support_feedback" to "service_role";

grant trigger on table "public"."support_feedback" to "service_role";

grant truncate on table "public"."support_feedback" to "service_role";

grant update on table "public"."support_feedback" to "service_role";

grant delete on table "public"."support_messages" to "anon";

grant insert on table "public"."support_messages" to "anon";

grant references on table "public"."support_messages" to "anon";

grant select on table "public"."support_messages" to "anon";

grant trigger on table "public"."support_messages" to "anon";

grant truncate on table "public"."support_messages" to "anon";

grant update on table "public"."support_messages" to "anon";

grant delete on table "public"."support_messages" to "authenticated";

grant insert on table "public"."support_messages" to "authenticated";

grant references on table "public"."support_messages" to "authenticated";

grant select on table "public"."support_messages" to "authenticated";

grant trigger on table "public"."support_messages" to "authenticated";

grant truncate on table "public"."support_messages" to "authenticated";

grant update on table "public"."support_messages" to "authenticated";

grant delete on table "public"."support_messages" to "service_role";

grant insert on table "public"."support_messages" to "service_role";

grant references on table "public"."support_messages" to "service_role";

grant select on table "public"."support_messages" to "service_role";

grant trigger on table "public"."support_messages" to "service_role";

grant truncate on table "public"."support_messages" to "service_role";

grant update on table "public"."support_messages" to "service_role";

grant delete on table "public"."support_tickets" to "anon";

grant insert on table "public"."support_tickets" to "anon";

grant references on table "public"."support_tickets" to "anon";

grant select on table "public"."support_tickets" to "anon";

grant trigger on table "public"."support_tickets" to "anon";

grant truncate on table "public"."support_tickets" to "anon";

grant update on table "public"."support_tickets" to "anon";

grant delete on table "public"."support_tickets" to "authenticated";

grant insert on table "public"."support_tickets" to "authenticated";

grant references on table "public"."support_tickets" to "authenticated";

grant select on table "public"."support_tickets" to "authenticated";

grant trigger on table "public"."support_tickets" to "authenticated";

grant truncate on table "public"."support_tickets" to "authenticated";

grant update on table "public"."support_tickets" to "authenticated";

grant delete on table "public"."support_tickets" to "service_role";

grant insert on table "public"."support_tickets" to "service_role";

grant references on table "public"."support_tickets" to "service_role";

grant select on table "public"."support_tickets" to "service_role";

grant trigger on table "public"."support_tickets" to "service_role";

grant truncate on table "public"."support_tickets" to "service_role";

grant update on table "public"."support_tickets" to "service_role";

grant delete on table "public"."waitlist" to "service_role";

grant insert on table "public"."waitlist" to "service_role";

grant references on table "public"."waitlist" to "service_role";

grant select on table "public"."waitlist" to "service_role";

grant trigger on table "public"."waitlist" to "service_role";

grant truncate on table "public"."waitlist" to "service_role";

grant update on table "public"."waitlist" to "service_role";


  create policy "penny_prompts_no_direct"
  on "public"."penny_prompts"
  as permissive
  for all
  to public
using (false)
with check (false);


CREATE TRIGGER penny_prompts_version_trg BEFORE INSERT ON public.penny_prompts FOR EACH ROW EXECUTE FUNCTION public.penny_prompts_set_version();


