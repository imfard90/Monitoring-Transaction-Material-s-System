'use client';

import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import CardBox from '@/app/components/shared/CardBox';
import { getStockMovements } from '../_actions/movement-actions';
import MovementTable from './MovementTable';

interface StockMovementClientProps {
    initialData: any[];
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

    const uniqueWarehouses = useMemo(() => {
        const set = new Set(data.map((item) => item.warehouse_name).filter(Boolean));
        return Array.from(set).sort() as string[];
    }, [data]);

    const uniqueMaterials = useMemo(() => {
        const set = new Set(data.map((item) => item.material_code).filter(Boolean));
        return Array.from(set).sort() as string[];
    }, [data]);

    const handleClearFilters = () => {
        setSearchQuery('');
        setDateRange(undefined);
        setWarehouseFilter('all');
        setMaterialFilter('all');
    };

    const loadMore = async () => {
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
    };

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
    }, [data, searchQuery, dateRange, warehouseFilter, materialFilter]);

    useEffect(() => {
        if (searchQuery && filteredData.length === 0 && hasMoreData && !isLoadingMore) {
            const timeout = setTimeout(() => {
                loadMore();
            }, 800);
            return () => clearTimeout(timeout);
        }
    }, [searchQuery, filteredData.length, hasMoreData, isLoadingMore]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="flex flex-col flex-1 min-h-0"
        >
            <CardBox className="flex flex-col flex-1 min-h-0 overflow-hidden p-6">
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
                    uniqueWarehouses={uniqueWarehouses}
                    uniqueMaterials={uniqueMaterials}
                    onClearFilters={handleClearFilters}
                />
                {isLoadingMore && (
                    <div className="text-center text-sm text-gray-500 py-2">
                        Mencari di 5 bulan sebelumnya...
                    </div>
                )}
            </CardBox>
        </motion.div>
    );
}
