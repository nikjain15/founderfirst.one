/**
 * Shared config — single source of truth for the intake endpoint default.
 * Loaded by background.js (importScripts, classic service worker) and by
 * options.html (plain <script> before options.js). No bundler in this
 * extension, so this is the plainest way to de-duplicate the literal without
 * converting either entry point to an ES module.
 */
const DEFAULT_ENDPOINT =
  "https://ejqsfzggyfsjzrcevlnq.supabase.co/functions/v1/listening-intake";
