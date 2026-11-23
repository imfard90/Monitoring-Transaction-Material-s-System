'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';

export interface WarehouseItem {
    id: number;
    name: string;
    branch?: string | null;
    is_active?: boolean | null;
    [key: string]: unknown;
}

export interface WarehouseActionResult {
    success: boolean;
    data: WarehouseItem[];
    error?: string;
}

export const WAREHOUSE_STORAGE_KEY = 'mtms_ref_warehouses_v1';

/**
 * Membaca data cache master gudang dari localStorage browser jika tersedia.
 * Bertujuan agar UI dropdown atau filter dapat langsung dirender instan (0ms) tanpa layout shift.
 */
export function getStoredWarehouses(): WarehouseActionResult | undefined {
    if (typeof window === 'undefined') return undefined;
    try {
        const raw = localStorage.getItem(WAREHOUSE_STORAGE_KEY);
        if (!raw) return undefined;
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.data) && parsed.data.length > 0) {
            return parsed as WarehouseActionResult;
        }
    } catch {
        // Fallback graceful jika corrupt atau dibatasi
    }
    return undefined;
}

/**
 * Menyimpan data master gudang terbaru ke localStorage browser.
 * Dipertahankan sampai pengguna membersihkan cache browser.
 */
export function setStoredWarehouses(data: WarehouseActionResult): void {
    if (typeof window === 'undefined' || !data || !data.success) return;
    try {
        localStorage.setItem(WAREHOUSE_STORAGE_KEY, JSON.stringify(data));
    } catch {
        // Abaikan jika storage kuota penuh
    }
}

/**
 * Hook kustom untuk mengambil data Master Gudang (mas_wh) dengan strategi Stale-While-Revalidate (SWR):
 * 1. Mengembalikan data dari localStorage secara instan saat inisialisasi (initialData).
 * 2. Menjalankan revalidasi server di latar belakang melalui TanStack Query untuk memastikan data tetap 100% real-time.
 * 3. Menyimpan hasil terbaru kembali ke localStorage agar bertahan sampai pengguna menghapus cache browser.
 */
export function useWarehouses(
    fetcher: () => Promise<WarehouseActionResult>,
    options?: { enabled?: boolean }
) {
    const query = useQuery({
        queryKey: queryKeys.warehouses.all,
        queryFn: async () => {
            const result = await fetcher();
            if (result.success && Array.isArray(result.data) && result.data.length > 0) {
                setStoredWarehouses(result);
            }
            return result;
        },
        initialData: () => getStoredWarehouses(),
        staleTime: 5 * 60 * 1000, // 5 menit dianggap segar di memori
        gcTime: 24 * 60 * 60 * 1000, // Disimpan dalam cache query hingga 24 jam
        enabled: options?.enabled ?? true,
    });

    const warehouses: WarehouseItem[] = query.data?.data || [];

    return {
        ...query,
        warehouses,
    };
}
