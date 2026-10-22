import type { ReactNode } from 'react';
import { PublicFooter } from './_components/PublicFooter';

export default function PublicLayout({ children }: { children: ReactNode }) {
    return (
        <div className="flex min-h-screen flex-col bg-background">
            <main className="w-full flex-1">{children}</main>
            <PublicFooter />
        </div>
    );
}