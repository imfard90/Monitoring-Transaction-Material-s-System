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

/**
 * ErrorBoundary — fallback error UI premium.
 *
 * Sesuai premium-ui-ux-builder/SKILL.md §2.4 (motion), §3.7 (pesan ID),
 * dan AGENTS.md §2 langkah 8 (tidak ada console.error di server; untuk
 * client boundary andalkan callback `onError` yang disediakan konsumen
 * untuk pelaporan terstruktur, mis. ke endpoint log/api).
 */
export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        // Delegate structured reporting to consumer; avoid console.error
        // as UI feedback channel (premium-ui-ux-builder/SKILL.md §3.7).
        this.props.onError?.(error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: undefined });
    };

    handleReload = () => {
        if (typeof window !== 'undefined') window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;

            return (
                <Alert
                    variant="destructive"
                    role="alert"
                    className="my-4 motion-reduce:transition-none"
                >
                    <Icon
                        icon="mdi:alert-triangle"
                        className="h-4 w-4"
                        aria-hidden="true"
                    />
                    <AlertTitle>Terjadi kesalahan</AlertTitle>
                    <AlertDescription className="mt-2">
                        <p className="mb-4 text-sm">
                            {this.state.error?.message ||
                                'Terjadi kesalahan tak terduga. Silakan coba lagi.'}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={this.handleReset}
                                className="gap-2"
                            >
                                <Icon
                                    icon="mdi:refresh"
                                    className="h-4 w-4"
                                    aria-hidden="true"
                                />
                                Coba lagi
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={this.handleReload}
                                className="gap-2"
                            >
                                <Icon
                                    icon="mdi:reload"
                                    className="h-4 w-4"
                                    aria-hidden="true"
                                />
                                Muat ulang halaman
                            </Button>
                        </div>
                    </AlertDescription>
                </Alert>
            );
        }

        return this.props.children;
    }
}
