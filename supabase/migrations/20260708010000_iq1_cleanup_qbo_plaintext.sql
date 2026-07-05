-- IQ-1-CLEANUP — null the legacy plaintext QBO tokens now that the pgcrypto
-- encrypt/decrypt roundtrip has been proven live in prod on real crypto
-- (dec_qbo_token(pgp_sym_encrypt('x', qbo_token_key)) = 'x', verified 5 Jul —
-- see the backlog note). 20260707130000_iq1_qbo_token_encryption.sql
-- deliberately LEFT the plaintext access_token/refresh_token columns populated
-- (dual-read fallback) until this proof landed. That proof is in; this
-- migration is the follow-up it flagged.
--
-- What this does:
--   1. Belt-and-suspenders: encrypt any row that (for whatever reason) still
--      lacks its _enc value — should be none in prod (the prior migration
--      already encrypted every existing row in place), but a migration that
--      assumes prior state without re-checking it is how rule #11's kind of
--      drift happens.
--   2. Null every plaintext access_token/refresh_token now that every row
--      with a token has its encrypted counterpart.
-- Nothing is dropped: the columns stay (rollback-safe, matches the prior
-- migration's stance) — only the plaintext VALUES are cleared. Reads still
-- go through ext_connection_secrets(), which is unchanged and keeps its
-- coalesce-to-plaintext fallback as defense-in-depth (LEARNINGS #15) in case
-- a future row is ever written without going through set_qbo_tokens().

create or replace function _iq1_cleanup_legacy_qbo_plaintext()
returns void language plpgsql security definer set search_path = public as $$
begin
  update external_connections
     set access_token_enc = enc_qbo_token(access_token)
   where access_token is not null and access_token_enc is null;

  update external_connections
     set refresh_token_enc = enc_qbo_token(refresh_token)
   where refresh_token is not null and refresh_token_enc is null;

  update external_connections
     set access_token = null
   where access_token is not null;

  update external_connections
     set refresh_token = null
   where refresh_token is not null;
end;
$$;
revoke all on function _iq1_cleanup_legacy_qbo_plaintext() from public, anon, authenticated;
grant execute on function _iq1_cleanup_legacy_qbo_plaintext() to service_role;

select _iq1_cleanup_legacy_qbo_plaintext();

-- End of migration.
