import { Component, type ErrorInfo, type ReactNode } from 'react';
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
