-- Storage bucket for content-pipeline audio (Step 6). Public read because the
-- audio is embedded on the public blog; writes happen only via the content-audio
-- edge function using the service role (which bypasses storage RLS). No extra
-- object policies needed: a public bucket is anon-readable, service-role writable.
insert into storage.buckets (id, name, public)
values ('content-audio', 'content-audio', true)
on conflict (id) do nothing;
