/**
 * tableFetchState — a fetch-backed table body has 4 mutually-exclusive states:
 * loading / errored / genuinely-empty / has-rows. The weekly audit (5 Jul)
 * found DiscordLinks.tsx rendering an ERROR banner ("couldn't load") at the
 * same time as an empty-state row ("No Discord links yet.") — because the
 * fetch failure left `rows` at its default `[]`, and the empty-row branch
 * only checked `rows.length === 0` without also checking for an error. That
 * told the admin "there are zero links" when the truth was "the fetch failed
 * and we don't know." Centralize the branch here so any table-with-fetch can
 * reuse it instead of re-deriving (and re-breaking) the same logic per file.
 */
export type TableFetchState = "loading" | "error" | "empty" | "rows";

export function tableFetchState(loading: boolean, hasError: boolean, rowCount: number): TableFetchState {
  if (loading) return "loading";
  if (hasError) return "error";
  if (rowCount === 0) return "empty";
  return "rows";
}
