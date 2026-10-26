import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
    status?: string | null;
    className?: string;
}

/**
 * StatusBadge — menampilkan status domain sebagai badge semantik.
 *
 * Menggunakan token warna tema (light* + semantic) sesuai
 * panduan MTMS (AGENTS.md §3.4 & ui-ux-pro-max):
 * - Konsistensi sistem desain via token semantik.
 * - Aksesibilitas: tidak mengandalkan warna saja, menyertakan teks label dan aria-label.
 * - Mendukung dark mode secara otomatis lewat token.
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
    if (!status) {
        return <span className="text-muted-foreground">-</span>;
    }

    const val = status.toLowerCase();
    const variant: BadgeProps['variant'] = mapStatusVariant(val);

    return (
        <Badge
            variant={variant}
            className={cn('capitalize border-none motion-reduce:transition-none', className)}
            aria-label={`Status: ${val.replace(/_/g, ' ')}`}
        >
            {val.replace(/_/g, ' ')}
        </Badge>
    );
}

function mapStatusVariant(val: string): BadgeProps['variant'] {
    if (val === 'request' || val === 'requested') return 'lightInfo';
    if (val === 'pending' || val === 'wait_approve' || val === 'in_transit') return 'lightWarning';
    if (val === 'intech') return 'lightSecondary';
    if (val === 'close' || val === 'closed' || val === 'rekon' || val === 'accepted' || val === 'approved') {
        return 'lightSuccess';
    }
    if (val === 'cancel' || val === 'rejected' || val === 'cancelled') {
        return 'lightError';
    }
    return 'outline';
}
