import { Component, type ErrorInfo, type ReactNode } from 'react';
import { captureError } from '@/observability/sentry';
import { logger } from '@/utils/logger';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Catches render/lifecycle errors in the subtree below it so a single broken
 * component shows a fallback instead of taking down the whole page with an
 * uncaught exception (React unmounts the entire tree on an uncaught render error).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error('[ErrorBoundary] Caught render error:', error, errorInfo.componentStack);
    // A render error unmounts the whole subtree, so the shopper sees a fallback
    // and typically just leaves — this is the one class of failure least likely
    // to be reported by the person it happened to. The component stack is what
    // makes it actionable; it names components, not user data.
    captureError(error, { componentStack: errorInfo.componentStack });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div role="alert" style={{ padding: '2rem', textAlign: 'center' }}>
            <p>Something went wrong. Please refresh the page.</p>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
