'use client';

import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { usePageFilterEsc } from '@/app/components/shared/usePageFilterEsc';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SearchField } from '@/components/ui/search-field';
import { getLiveStockData } from './_actions/live-stock-queries';
import { LiveIndicator } from './_components/LiveIndicator';
import { MaterialCards } from './_components/MaterialCards';
import { StockSummaryCards } from './_components/StockSummaryCards';
import { StockTable } from './_components/StockTable';
import { LIVE_STOCK_REFRESH_MS, type LiveStockData } from './_lib/stock-status';

const REFRESH_INTERVAL = LIVE_STOCK_REFRESH_MS;

type Result = { success: true; data: LiveStockData } | { success: false; error: string };

export function LiveStockClient({ initialData }: { initialData?: Result }) {
    const [selectedWarehouseId, setSelectedWarehouseId] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');

    const hasActiveFilters = Boolean(searchQuery.trim() || selectedWarehouseId !== 0);

    const handleResetFilters = useCallback(() => {
        setSearchQuery('');
        setSelectedWarehouseId(0);
    }, []);

    usePageFilterEsc({
        isActive: hasActiveFilters,
        onReset: handleResetFilters,
    });

    const { data, isFetching, error, dataUpdatedAt, refetch } = useQuery({
        queryKey: ['liveStock'],
        queryFn: async () => {
            const result = await getLiveStockData();
            if (!result.success) throw new Error(result.error);
            return result.data;
        },
        initialData: initialData?.success ? initialData.data : undefined,
        staleTime: REFRESH_INTERVAL,
        refetchInterval: REFRESH_INTERVAL,
    });

    /** Material untuk kartu mobile; desktop tetap memakai tabel + filter gudang. */
    const mobileItems = useMemo(() => {
        const items = data?.items ?? [];
        const query = searchQuery.trim().toLowerCase();
        if (!query) return items;
        return items.filter(
            (item) =>
                item.material_code.toLowerCase().includes(query) ||
                item.material_name.toLowerCase().includes(query)
        );
    }, [data?.items, searchQuery]);

    const mobileMaterialCount = useMemo(
        () => new Set(mobileItems.map((item) => item.material_code)).size,
        [mobileItems]
    );

    if (error) {
        return (
            <div className="mx-auto max-w-3xl p-6">
                <Card className="border-destructive/40 bg-destructive/5">
                    <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
                        <p className="font-medium text-destructive">Gagal memuat data stok</p>
                        <p className="text-sm text-muted-foreground">{error.message}</p>
                        <Button variant="outline" size="sm" onClick={() => refetch()}>
                            Coba lagi
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <p className="animate-pulse text-muted-foreground">Memuat...</p>
            </div>
        );
    }

    return (
        <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8">
            {/* Mobile sticky header: judul + search + info tidak ikut scroll */}
            <div className="sticky top-0 z-30 -mx-4 mb-4 border-b border-border/70 bg-background px-4 pt-3 pb-3 animate-in fade-in duration-300 sm:static sm:mx-0 sm:mb-6 sm:flex sm:flex-row sm:items-end sm:justify-between sm:gap-3 sm:border-0 sm:bg-transparent sm:p-0">
                <div className="min-w-0">
                    <h1 className="text-lg leading-tight font-bold tracking-tight text-foreground sm:text-3xl">
                        Live Stock Material Inventory
                    </h1>
                    <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
                        Posisi stok seluruh gudang,{' '}
                        {isFetching ? 'memperbarui...' : 'diperbarui otomatis tiap 5 menit'}
                    </p>

                    <div className="mt-2 sm:hidden">
                        <SearchField
                            value={searchQuery}
                            onValueChange={setSearchQuery}
                            onClear={handleResetFilters}
                            placeholder="Cari kode atau nama material"
                            aria-label="Cari material"
                            className="h-9"
                        />
                    </div>
                    <p
                        className="mt-1.5 truncate text-[11px] text-muted-foreground sm:hidden"
                        aria-live="polite"
                    >
                        {searchQuery.trim()
                            ? `${mobileMaterialCount} material cocok`
                            : `${mobileMaterialCount} material · stok seluruh gudang`}
                    </p>
                </div>
                <div className="hidden sm:block">
                    <LiveIndicator dataUpdatedAt={dataUpdatedAt} intervalMs={REFRESH_INTERVAL} />
                </div>
            </div>

            {/* Summary cards — desktop only */}
            <div className="mb-6 hidden animate-in fade-in duration-300 sm:block">
                <StockSummaryCards data={data.summary} />
            </div>

            {/* Mobile card list */}
            <div className="animate-in fade-in duration-300 sm:hidden">
                <MaterialCards items={mobileItems} />
            </div>

            {/* Desktop table */}
            <div className="hidden animate-in fade-in duration-300 sm:block">
                <StockTable
                    items={data.items}
                    warehouses={data.warehouses}
                    selectedWarehouseId={selectedWarehouseId}
                    onWarehouseChange={setSelectedWarehouseId}
                />
            </div>
        </div>
    );
}
