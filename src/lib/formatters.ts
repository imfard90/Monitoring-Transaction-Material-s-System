/**
 * Utility functions for currency and date formatting standard across MTMS.
 */

/**
 * Formats a number to Indonesian Rupiah (IDR).
 * e.g. 1500000 -> "Rp 1.500.000"
 */
export function formatRupiah(amount: number | null | undefined): string {
    if (amount === null || amount === undefined || Number.isNaN(amount)) {
        return 'Rp 0';
    }
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(amount);
}

/**
 * Formats a date to standard Indonesian locale.
 * Default format: "dd MMM yyyy, HH:mm"
 */
export function formatDateId(
    date: string | Date | null | undefined,
    includeTime = true
): string {
    if (!date) return '-';
    try {
        const d = typeof date === 'string' ? new Date(date) : date;
        if (Number.isNaN(d.getTime())) return '-';

        return new Intl.DateTimeFormat('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            ...(includeTime
                ? {
                      hour: '2-digit',
                      minute: '2-digit',
                  }
                : {}),
        }).format(d);
    } catch {
        return '-';
    }
}
