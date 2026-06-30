import { Component, type ReactNode } from "react";

/**
 * Catches render-time crashes and failed lazy-chunk loads so one broken view
 * degrades to a friendly message instead of blanking the whole SPA (#9). The
 * `resetKey` (route pathname) clears the error on navigation so moving away
 * recovers without a manual reload. Async/event errors aren't caught here —
 * those surface through each view's own query error states.
 */
type Props = { resetKey?: string; children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
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
    console.error("App route error:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="empty" role="alert">
          <p className="empty-title">Something went wrong.</p>
          <p className="muted">
            This view failed to load — usually because a new version shipped while
            this tab was open. Reloading fixes it.
          </p>
          <p>
            <button type="button" onClick={() => window.location.reload()}>Reload</button>
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
