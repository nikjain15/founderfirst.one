-- Force PostgREST to reload its schema cache so the collapsed single-signature
-- sig_submit_score (11-arg) is picked up and the stale 7-/9-arg overloads stop
-- causing "could not choose the best candidate function" errors.
notify pgrst, 'reload schema';
