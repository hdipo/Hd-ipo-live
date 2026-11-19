import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ChatVault ErrorBoundary caught:', error, info.componentStack);
  }

  private getReadableMessage(): string {
    const raw = this.state.errorMessage;
    if (raw.includes('Quota exceeded')) {
      return 'Daily database quota has been reached. Free tier quotas reset automatically the next day.';
    }
    try {
      const parsed = JSON.parse(raw) as { error?: string; operationType?: string };
      if (parsed.error) {
        if (parsed.error.toLowerCase().includes('permission')) {
          return 'You do not have permission to perform this action. Please sign in again with your verified Google account.';
        }
        return parsed.error;
      }
    } catch {
      // Plain error string
    }
    return raw;
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <div className="flex items-center gap-3 text-rose-700 dark:text-rose-400 mb-3">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Something went wrong
              </h1>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-5">
              {this.getReadableMessage()}
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
