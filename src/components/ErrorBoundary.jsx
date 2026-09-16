import React from 'react';

// Route-level crash containment: a render crash in one view (detail,
// rooms, player) shows a glass fallback instead of a white screen.
// Parent passes key={routeKey} so successful navigation auto-resets.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('UI crash contained:', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      const { onHome, homeLabel = 'Go Home' } = this.props;
      return (
        <main className="cine-container cine-container--page">
          <div className="cine-glass-panel rounded-3xl p-8 max-w-md mx-auto mt-16 text-center space-y-4">
            <p className="text-lg font-bold text-white">Something broke</p>
            <p className="text-sm text-white/60 leading-relaxed">
              This screen crashed, but the rest of the app is fine. Try again
              or head home.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => this.setState({ error: null })}
                className="cine-control-btn"
              >
                Try again
              </button>
              {onHome && (
                <button
                  onClick={() => {
                    this.setState({ error: null });
                    onHome();
                  }}
                  className="cine-btn cine-btn-primary h-9 px-5 text-xs"
                >
                  {homeLabel}
                </button>
              )}
            </div>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
