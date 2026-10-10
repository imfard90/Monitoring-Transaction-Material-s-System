'use client';

import { Icon } from '@iconify/react';
import { Component, type ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

type Props = {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
};

type State = {
    hasError: boolean;
    error?: Error;
};

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        this.props.onError?.(error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: undefined });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <Alert variant="destructive" className="my-4">
                    <Icon icon="mdi:alert-triangle" className="h-4 w-4" />
                    <AlertTitle>Something went wrong</AlertTitle>
                    <AlertDescription className="mt-2">
                        <p className="mb-4 text-sm">
                            {this.state.error?.message || 'An unexpected error occurred.'}
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={this.handleReset}
                            className="gap-2"
                        >
                            <Icon icon="mdi:refresh" className="h-4 w-4" />
                            Try again
                        </Button>
                    </AlertDescription>
                </Alert>
            );
        }

        return this.props.children;
    }
}
