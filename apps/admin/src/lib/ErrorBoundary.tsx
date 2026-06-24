import { Component, type ReactNode } from "react";

/**
 * Catches render-time crashes and failed lazy-chunk loads so a single broken
 * view degrades to a friendly message instead of a blank white screen.
 *
 * Sits inside <main> (the nav/shell stays usable), so a user who hits an error
 * can still navigate away. `resetKey` is the current pathname: when it changes
 * we clear the error, so navigating to another route recovers without a manual
 * reload.
 *
 * Note: error boundaries only catch errors thrown during render/lifecycle and
 * by lazy() imports — not async/event-handler errors (those surface through
 * each view's own query error states). The common failure this guards is a
 * stale tab whose code-split chunk 404s after a redeploy.
 */
type Props = { resetKey: string; children: ReactNode };
type State = { error: Error | null };

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error) {
    // Surface for debugging; no external telemetry.
    console.error("Admin route error:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="empty" role="alert">
          <p className="empty-title">Something went wrong.</p>
          <p>
            This view failed to load — usually because a new version shipped
            while this tab was open. Reloading fixes it.
          </p>
          <p>
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              Reload
            </button>
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
