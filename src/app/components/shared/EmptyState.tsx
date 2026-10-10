'use client';

import { Icon } from '@iconify/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type EmptyStateProps = {
    title?: string;
    description?: string;
    icon?: ReactNode;
    action?: ReactNode;
    className?: string;
};

/**
 * EmptyState — state kosong premium.
 *
 * Sesuai premium-ui-ux-builder/SKILL.md §3.7 & §2.4:
 * - Pesan pengguna dalam Bahasa Indonesia, sopan, dan konkret.
 * - Menghormati prefers-reduced-motion.
 * - Menyediakan ruang aksi (CTA) bila diberikan pemanggil.
 */
export function EmptyState({
    title = 'Belum ada data',
    description = 'Data yang Anda cari belum tersedia saat ini.',
    icon,
    action,
    className,
}: EmptyStateProps) {
    return (
        <div
            role="status"
            className={cn(
                'flex min-h-[320px] flex-col items-center justify-center gap-4 p-8 text-center',
                'motion-reduce:transition-none',
                className,
            )}
        >
            <div
                className="rounded-full bg-muted p-5 text-muted-foreground transition-colors motion-reduce:transition-none"
                aria-hidden="true"
            >
                {icon ?? (
                    <Icon
                        icon="mdi:inbox-outline"
                        className="h-10 w-10"
                    />
                )}
            </div>
            <div className="space-y-1.5">
                <h3 className="text-lg font-semibold text-foreground">
                    {title}
                </h3>
                <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                    {description}
                </p>
            </div>
            {action && <div className="mt-2">{action}</div>}
        </div>
    );
}
