/**
 * Site-wide constants now live in the shared `@ff/site` package so apps/web and
 * apps/admin share one source of truth. This file re-exports it to keep existing
 * `../lib/site` imports across the web app working unchanged.
 */
export { SITE } from "@ff/site";
