/**
 * ShowMore — a calm "Show all N / Show fewer" toggle for long lists (owner-calm
 * redesign). A CPA firm can have 50+ clients or queue items; rendering them all at
 * once buries the first screen. Lists cap to a sensible default and reveal the rest
 * on demand. Copy is COPY.common (CENTRAL-1); this holds no strings.
 */
import { COPY } from "../copy";

export function ShowMore({
  total, expanded, onToggle,
}: {
  total: number; expanded: boolean; onToggle: () => void;
}) {
  return (
    <button type="button" className="ghost sm show-more" onClick={onToggle}>
      {expanded ? COPY.common.showFewer : COPY.common.showAll(total)}
    </button>
  );
}
