-- Voice studio settings — make Penny's SPOKEN voice fully admin-tunable.
--
-- The content pipeline renders audio with Kokoro (open, local/CPU, warm female
-- voices). These columns let an admin change the voice (tone) and pace without
-- code: the renderer reads the active profile live. Defaults capture the locked
-- pick: af_heart 60% + af_nova 40%, American, speed 0.88.
alter table public.content_voice_profile
  add column if not exists engine   text    not null default 'kokoro'
    check (engine in ('kokoro', 'chatterbox', 'elevenlabs')),
  add column if not exists voice_a  text    not null default 'af_heart',
  add column if not exists voice_b  text    default 'af_nova',
  add column if not exists blend    numeric not null default 0.6
    check (blend >= 0 and blend <= 1),                 -- weight of voice_a; voice_b = 1-blend
  add column if not exists speed    numeric not null default 0.88
    check (speed >= 0.5 and speed <= 2.0),
  add column if not exists gap_ms   int     not null default 260
    check (gap_ms >= 0 and gap_ms <= 2000),            -- pause between sentences
  add column if not exists lang     text    not null default 'a'
    check (lang in ('a', 'b')),                        -- a=American, b=British
  add column if not exists bitrate  text    not null default '160k',
  add column if not exists warmth   numeric not null default 0
    check (warmth >= -6 and warmth <= 6);              -- optional low-shelf warmth, dB

-- Admin: update the active profile's synth settings (audited via app layer).
create or replace function set_voice_synth_settings(
  p_engine  text default null,
  p_voice_a text default null,
  p_voice_b text default null,
  p_blend   numeric default null,
  p_speed   numeric default null,
  p_gap_ms  int default null,
  p_lang    text default null,
  p_bitrate text default null,
  p_warmth  numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'set_voice_synth_settings: admin access required';
  end if;
  update content_voice_profile set
    engine  = coalesce(p_engine,  engine),
    voice_a = coalesce(p_voice_a, voice_a),
    voice_b = coalesce(p_voice_b, voice_b),
    blend   = coalesce(p_blend,   blend),
    speed   = coalesce(p_speed,   speed),
    gap_ms  = coalesce(p_gap_ms,  gap_ms),
    lang    = coalesce(p_lang,    lang),
    bitrate = coalesce(p_bitrate, bitrate),
    warmth  = coalesce(p_warmth,  warmth)
  where is_active = true;
end;
$$;

grant execute on function set_voice_synth_settings(text,text,text,numeric,numeric,int,text,text,numeric) to authenticated;
