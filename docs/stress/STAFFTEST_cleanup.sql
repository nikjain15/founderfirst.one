-- [stress:staff] cleanup — UN-RUN. Removes the only durable test fixture left on
-- prod by this session. All other probes ran inside transactions that RAISEd at
-- the end to force a ROLLBACK, so they left nothing.
--
-- Before/after prod row-count diff (this session):
--   auth.users           : +1   (tenant1@stafftest.founderfirst.test)
--   admins               :  0   (10 → 10; tier sims rolled back)
--   break_glass_grants   :  0   (4 → 4; lifecycle sims rolled back)
--   admin_audit          :  0   (open/close audit writes rolled back)
--
-- The fixture is a plain authenticated tenant user (NOT an admin, NOT platform
-- staff) used to prove non-staff/non-admin gates from a real JWT. Safe to delete.

delete from auth.users where email = 'tenant1@stafftest.founderfirst.test';
