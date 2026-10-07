'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import CardBox from '@/app/components/shared/CardBox';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { getStockMovements } from '../_actions/movement-actions';
import type { StockMovementItem } from './MovementTable';
import MovementTable from './MovementTable';

interface StockMovementClientProps {
    initialData: StockMovementItem[];
}

export default function StockMovementClient({ initialData }: StockMovementClientProps) {
    const [data, setData] = useState(initialData);
    const [monthsOffset, setMonthsOffset] = useState(0);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMoreData, setHasMoreData] = useState(true);

    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [warehouseFilter, setWarehouseFilter] = useState('all');
    const [materialFilter, setMaterialFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');

    const uniqueWarehouses = useMemo(() => {
        const set = new Set(data.map((item) => item.warehouse_name).filter(Boolean));
        return Array.from(set).sort() as string[];
    }, [data]);

    const uniqueMaterials = useMemo(() => {
        const set = new Set(data.map((item) => item.material_code).filter(Boolean));
        return Array.from(set).sort() as string[];
    }, [data]);

    const uniqueTypes = useMemo(() => {
        const set = new Set(data.map((item) => item.movement_type).filter(Boolean));
        return Array.from(set).sort() as string[];
    }, [data]);

    const handleClearFilters = () => {
        setSearchQuery('');
        setDateRange(undefined);
        setWarehouseFilter('all');
        setMaterialFilter('all');
        setTypeFilter('all');
    };

    const loadMore = useCallback(async () => {
        if (isLoadingMore || !hasMoreData) return;
        setIsLoadingMore(true);
        try {
            const nextOffset = monthsOffset + 5;
            const newData = await getStockMovements(nextOffset, 5);
            if (newData.length === 0) {
                setHasMoreData(false);
            } else {
                setData((prev) => [...prev, ...newData]);
                setMonthsOffset(nextOffset);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoadingMore(false);
        }
    }, [isLoadingMore, hasMoreData, monthsOffset]);

    const filteredData = useMemo(() => {
        return data.filter((item) => {
            // Date filter (Range)
            if (dateRange?.from && item.created_at) {
                const itemDate = new Date(item.created_at);
                itemDate.setHours(0, 0, 0, 0); // normalize

                const fromDate = new Date(dateRange.from);
                fromDate.setHours(0, 0, 0, 0);
                if (itemDate < fromDate) return false;

                if (dateRange.to) {
                    const toDate = new Date(dateRange.to);
                    toDate.setHours(23, 59, 59, 999);
                    if (itemDate > toDate) return false;
                }
            }

            // Warehouse filter
            if (
                warehouseFilter &&
                warehouseFilter !== 'all' &&
                item.warehouse_name !== warehouseFilter
            ) {
                return false;
            }

            // Material filter
            if (
                materialFilter &&
                materialFilter !== 'all' &&
                item.material_code !== materialFilter
            ) {
                return false;
            }

            // Type filter
            if (typeFilter && typeFilter !== 'all' && item.movement_type !== typeFilter) {
                return false;
            }

            // Search filter
            const q = searchQuery.toLowerCase();
            return (
                item.material_code?.toLowerCase().includes(q) ||
                item.material_name?.toLowerCase().includes(q) ||
                item.reference_trx?.toLowerCase().includes(q) ||
                item.warehouse_name?.toLowerCase().includes(q) ||
                item.movement_type?.toLowerCase().includes(q)
            );
        });
    }, [data, searchQuery, dateRange, warehouseFilter, materialFilter, typeFilter]);

    useEffect(() => {
        if (searchQuery && filteredData.length === 0 && hasMoreData && !isLoadingMore) {
            const timeout = setTimeout(() => {
                loadMore();
            }, 800);
            return () => clearTimeout(timeout);
        }
    }, [searchQuery, filteredData.length, hasMoreData, isLoadingMore, loadMore]);

    return (
        <StaggerContainer className="flex flex-col flex-1 md:h-full md:min-h-0 md:overflow-hidden">
            <StaggerItem className="flex flex-col flex-1 md:h-full md:min-h-0 md:overflow-hidden">
                <CardBox className="flex flex-col flex-1 p-6 md:h-full md:min-h-0 md:overflow-hidden">
                    <MovementTable
                        data={filteredData}
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        dateRange={dateRange}
                        onDateRangeChange={setDateRange}
                        warehouseFilter={warehouseFilter}
                        onWarehouseFilterChange={setWarehouseFilter}
                        materialFilter={materialFilter}
                        onMaterialFilterChange={setMaterialFilter}
                        typeFilter={typeFilter}
                        onTypeFilterChange={setTypeFilter}
                        uniqueWarehouses={uniqueWarehouses}
                        uniqueMaterials={uniqueMaterials}
                        uniqueTypes={uniqueTypes}
                        onClearFilters={handleClearFilters}
                    />
                    {isLoadingMore && (
                        <div className="text-center text-sm text-gray-500 py-2">
                            Mencari di 5 bulan sebelumnya...
                        </div>
                    )}
                </CardBox>
            </StaggerItem>
        </StaggerContainer>
    );
}
